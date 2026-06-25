import { DataCleaningConfig } from '../interfaces/DataMapping';
import { RowDeleteReason, CellDeleteReason, CellModifyReason } from '../interfaces/CleaningReport';
import { DetectableFields } from '../types/DataMapping';
import { getRawTableName } from '../utils/utils';
import { OUTSIDE_LOD_VALUE } from '../constants/constants';

interface CleaningCteBundle {
  /**
   * Columns exposed by `cleaning_result`:
   *   record_id, geom (WKB), sampling_date, horizon, license,
   *   min_depth (int|null), max_depth (int|null),
   *   {p}_cleaned (numeric|null)              — cleaned value after all cell rules incl. dedup
   *   cell_delete_reasons (jsonb|null)        — {"prop": CellDeleteReason, ...}; null when empty
   *   cell_modify_reasons (jsonb|null)        — {"prop": ["unit_converted"|"value_rounded", ...], "depth": ["depth_rounded"]}; null when empty
   *   row_delete_reason (text|null)           — from row-level checks; null on surviving rows
   *   _rn (int)                               — ROW_NUMBER for full-row dedup within surviving rows
   *   final_row_delete_reason (text|null)     — null = row survives; string = deletion reason
   */
  cte: string;
  values: unknown[];
  propertyCols: string[];
}

const NUMERIC_RE = `'^-?[0-9]+(\\.[0-9]+)?$'`;

export function buildCleaningCte(config: DataCleaningConfig, fileId: string): CleaningCteBundle {
  const schema = process.env.POSTGRES_SCHEMA;
  const table = `${schema}.${getRawTableName(fileId)}`;
  const props = Object.entries(config.property_cols);
  const meta = config.metadata_cols;
  const values: unknown[] = [];
  const p = (val: unknown) => {
    values.push(val);
    return `$${values.length}`;
  };

  const metaCol = (field: DetectableFields): string | null => meta[field] ?? null;

  const depthCol = metaCol(DetectableFields.DEPTH);
  const minDepthCol = metaCol(DetectableFields.MIN_DEPTH);
  const maxDepthCol = metaCol(DetectableFields.MAX_DEPTH);

  const splitDepth = (part: 1 | 2, srcCol: string) =>
    `NULLIF(regexp_replace(split_part(raw.${srcCol}::text, '-', ${part}), '[^0-9.]', '', 'g'), '')::numeric`;

  const minDepthRaw = minDepthCol ? `(raw.${minDepthCol})::numeric` : depthCol ? splitDepth(1, depthCol) : 'NULL::numeric';

  const maxDepthRaw = maxDepthCol ? `(raw.${maxDepthCol})::numeric` : depthCol ? splitDepth(2, depthCol) : 'NULL::numeric';

  const cleanDepth = (raw: string) =>
    `CASE
      WHEN (${raw}) IS NULL                THEN NULL
      WHEN (${raw}) = ${OUTSIDE_LOD_VALUE} THEN NULL
      WHEN (${raw}) < 0                    THEN NULL
      ELSE ROUND(${raw})::integer
    END`;

  const depthWasRounded = (raw: string) =>
    `((${raw}) IS NOT NULL AND (${raw}) != ${OUTSIDE_LOD_VALUE} AND (${raw}) >= 0 AND (${raw}) != ROUND(${raw}))`;

  const depthWasNeg = (raw: string) => `((${raw}) IS NOT NULL AND (${raw}) != ${OUTSIDE_LOD_VALUE} AND (${raw}) < 0)`;

  // Per-cell rules: non-numeric, sentinel, negative, zero, out-of-range.
  // Duplicate cell detection is deferred to CTE 2 because ROW_NUMBER cannot
  // reference column aliases from the same SELECT.

  const c1: string[] = ['raw.record_id', 'raw.geometry AS geom'];

  const sdCol = metaCol(DetectableFields.SAMPLING_DATE);
  c1.push(sdCol ? `raw.${sdCol}::text AS sampling_date` : 'NULL::text AS sampling_date');

  const hzCol = metaCol(DetectableFields.HORIZON);
  c1.push(hzCol ? `raw.${hzCol}::text AS horizon` : 'NULL::text AS horizon');

  const licCol = metaCol(DetectableFields.LICENSE);
  c1.push(licCol ? `raw.${licCol}::text AS license` : 'NULL::text AS license');

  c1.push(`${cleanDepth(minDepthRaw)} AS min_depth`);
  c1.push(`${cleanDepth(maxDepthRaw)} AS max_depth`);
  c1.push(`(${depthWasRounded(minDepthRaw)} OR ${depthWasRounded(maxDepthRaw)}) AS depth_rounded`);
  c1.push(`(${depthWasNeg(minDepthRaw)} OR ${depthWasNeg(maxDepthRaw)}) AS depth_was_negative`);

  for (const [prop, cfg] of props) {
    const rawText = `raw.${prop}::text`;
    const rawNum = `(raw.${prop})::numeric`;
    const formula = cfg.conversion_formula?.replace(/"/g, '').trim() ?? null;
    const converted = formula ? formula.replace(/x/g, rawNum) : rawNum;

    const minVal = cfg.min_val ?? 0;
    const maxVal = cfg.max_val ?? (cfg.standard_unit === '%' ? 100 : undefined);

    const inRange = maxVal ? `(${converted}) BETWEEN ${p(minVal)} AND ${p(maxVal)}` : `(${converted}) >= ${p(minVal)}`;

    // Rejection flags (evaluated in CASE order — earlier wins).
    // Non-numeric must be first so the numeric cast in later conditions is safe.
    const isNull = `raw.${prop} IS NULL`;
    const isNonNum = `${rawText} !~ ${NUMERIC_RE}`;
    const isSentinel = `${rawNum} = ${OUTSIDE_LOD_VALUE}`;
    const isNeg = `${rawNum} < 0`;
    const isZero = `(${converted}) = 0`;
    const isOob = `NOT (${inRange})`;

    c1.push(`
      CASE
        WHEN ${isNull}     THEN NULL
        WHEN ${isNonNum}   THEN NULL
        WHEN ${isSentinel} THEN ${OUTSIDE_LOD_VALUE}
        WHEN ${isNeg}      THEN NULL
        WHEN ${isZero}     THEN NULL
        WHEN ${isOob}      THEN NULL
        ELSE ROUND((${converted}), 3)
      END AS ${prop}_cleaned`);

    c1.push(`
      CASE
        WHEN ${isNull}     THEN NULL
        WHEN ${isNonNum}   THEN '${CellDeleteReason.NON_NUMERIC}'
        WHEN ${isSentinel} THEN NULL
        WHEN ${isNeg}      THEN '${CellDeleteReason.NEGATIVE_VALUE}'
        WHEN ${isZero}     THEN '${CellDeleteReason.ZERO_VALUE}'
        WHEN ${isOob}     THEN '${CellDeleteReason.OOB}'
        ELSE NULL
      END AS ${prop}_cell_reason`);

    // Modification flags — only set when the value actually survives all checks.
    const isValid = `NOT ${isNull} AND NOT (${isNonNum}) AND NOT ${isSentinel} AND NOT ${isNeg} AND NOT ${isZero} AND NOT ${isOob}`;
    c1.push(formula ? `(${isValid}) AS ${prop}_unit_converted` : `FALSE AS ${prop}_unit_converted`);

    c1.push(`((${isValid}) AND (${converted}) != ROUND((${converted}), 3)) AS ${prop}_value_rounded`);
  }

  const cte1 = `cell_cleaned AS MATERIALIZED (
  SELECT
    ${c1.join(',\n    ')}
  FROM ${table} raw
)`;

  // Sub-select pre-computes one {p}_dup_rn per property so the outer SELECT
  // can reference it in both the deduped-value CASE and the JSONB builds
  // without repeating the window function.

  const c2BaseCols = ['sub.record_id', 'sub.geom', 'sub.sampling_date', 'sub.horizon', 'sub.license', 'sub.min_depth', 'sub.max_depth'];

  const subSelectCols: string[] = ['cc.*'];
  for (const [prop] of props) {
    const dupPartition = ['ST_AsBinary(cc.geom)', 'cc.min_depth', 'cc.max_depth', 'cc.sampling_date', `cc.${prop}_cleaned`].join(', ');
    subSelectCols.push(`
      CASE WHEN cc.${prop}_cleaned IS NOT NULL
        THEN ROW_NUMBER() OVER (PARTITION BY ${dupPartition} ORDER BY cc.record_id)
        ELSE 1
      END AS ${prop}_dup_rn`);
  }

  const c2PropCleanedCols: string[] = [];
  for (const [prop] of props) {
    c2PropCleanedCols.push(`
      CASE WHEN sub.${prop}_dup_rn > 1 THEN NULL ELSE sub.${prop}_cleaned
      END AS ${prop}_cleaned`);
  }

  const deleteEntries = [
    ...props.map(
      ([prop]) => `'${prop}', CASE WHEN sub.${prop}_dup_rn > 1 THEN '${CellDeleteReason.DUPLICATE_CELL}' ELSE sub.${prop}_cell_reason END`,
    ),
    `'depth', CASE WHEN sub.depth_was_negative THEN '${CellDeleteReason.NEGATIVE_VALUE}'::text ELSE NULL END`,
  ].join(',\n      ');
  const cellDeleteReasons = `NULLIF(jsonb_strip_nulls(jsonb_build_object(
      ${deleteEntries}
    )), '{}'::jsonb) AS cell_delete_reasons`;

  const modifyEntries = [
    ...props.map(
      ([prop]) =>
        `'${prop}', NULLIF(to_jsonb(ARRAY_REMOVE(ARRAY[
        CASE WHEN sub.${prop}_unit_converted THEN '${CellModifyReason.UNIT_CONVERTED}'::text ELSE NULL END,
        CASE WHEN sub.${prop}_value_rounded  THEN '${CellModifyReason.VALUE_ROUNDED}'::text  ELSE NULL END
      ], NULL)), '[]'::jsonb)`,
    ),
    `'depth', CASE WHEN sub.depth_rounded THEN '["${CellModifyReason.DEPTH_ROUNDED}"]'::jsonb ELSE NULL END`,
  ].join(',\n      ');
  const cellModifyReasons = `NULLIF(jsonb_strip_nulls(jsonb_build_object(
      ${modifyEntries}
    )), '{}'::jsonb) AS cell_modify_reasons`;

  const cte2 = `cell_deduped AS MATERIALIZED (
  SELECT
    ${[...c2BaseCols, ...c2PropCleanedCols, cellDeleteReasons, cellModifyReasons].join(',\n    ')}
  FROM (
    SELECT
      ${subSelectCols.join(',\n      ')}
    FROM cell_cleaned cc
  ) sub
)`;

  // Row-level checks; minimum-data-requirement uses the post-dedup cleaned values.
  const finalCleaned = props.length ? props.map(([p]) => `cd.${p}_cleaned`).join(', ') : 'NULL';

  const dropClause = config.drop_records?.length
    ? `WHEN cd.record_id IN (${config.drop_records.join(', ')}) THEN '${RowDeleteReason.USER_DELETION}'`
    : '';

  const cte3 = `row_annotated AS MATERIALIZED (
  SELECT
    cd.*,
    CASE
      ${dropClause} 
      WHEN cd.geom IS NULL
        THEN '${RowDeleteReason.MINIMUM_DATA_REQUIREMENT}'
      WHEN ST_X(cd.geom) NOT BETWEEN -180 AND 180
        OR ST_Y(cd.geom) NOT BETWEEN -90 AND 90
        THEN '${RowDeleteReason.INVALID_COORDINATES}'
      WHEN cd.min_depth IS NOT NULL
       AND cd.max_depth IS NOT NULL
       AND cd.min_depth >= cd.max_depth
        THEN '${RowDeleteReason.INVALID_DEPTH_INTERVAL}'
      WHEN COALESCE(${finalCleaned}) IS NULL
        THEN '${RowDeleteReason.MINIMUM_DATA_REQUIREMENT}'
      ELSE NULL
    END AS row_delete_reason
  FROM cell_deduped cd
)`;

  // Full-row duplicate detection among rows that passed all row-level checks.

  const rowPartition = [
    'ST_AsBinary(ra.geom)',
    'ra.min_depth',
    'ra.max_depth',
    'ra.sampling_date',
    ...props.map(([p]) => `ra.${p}_cleaned`),
  ].join(', ');

  const cte4 = `surviving AS (
  SELECT
    ra.*,
    ROW_NUMBER() OVER (
      PARTITION BY ${rowPartition}
      ORDER BY ra.record_id
    ) AS _rn
  FROM row_annotated ra
  WHERE ra.row_delete_reason IS NULL
)`;

  const cte5 = `cleaning_result AS (
    SELECT
      *,
      CASE
        WHEN _rn > 1 THEN '${RowDeleteReason.DUPLICATE_ROW}'
        ELSE NULL
      END AS final_row_delete_reason
    FROM surviving
    UNION ALL
    SELECT
    *,
    0 AS _rn,
    row_delete_reason AS final_row_delete_reason
    FROM row_annotated
    WHERE row_delete_reason IS NOT NULL
  )`;

  const cte = [cte1, cte2, cte3, cte4, cte5].join(',\n');

  return {
    cte: `WITH\n${cte}`,
    values,
    propertyCols: props.map(([prop]) => prop),
  };
}
