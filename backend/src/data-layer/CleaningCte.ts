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

  const c1: string[] = ['raw.record_id', 'raw.geometry AS geom'];

  const sdCol = metaCol(DetectableFields.SAMPLING_DATE);
  c1.push(sdCol ? `raw.${sdCol}::text AS sampling_date` : 'NULL::text AS sampling_date');

  const hzCol = metaCol(DetectableFields.HORIZON);
  c1.push(hzCol ? `raw.${hzCol}::text AS horizon` : 'NULL::text AS horizon');

  const licCol = metaCol(DetectableFields.LICENSE);
  c1.push(licCol ? `raw.${licCol}::text AS license` : 'NULL::text AS license');

  c1.push(`${cleanDepth(minDepthRaw)} AS min_depth`);
  c1.push(`${cleanDepth(maxDepthRaw)} AS max_depth`);
  c1.push(`${depthWasRounded(minDepthRaw)} AS min_depth_rounded`);
  c1.push(`${depthWasRounded(maxDepthRaw)} AS max_depth_rounded`);
  c1.push(`${depthWasNeg(minDepthRaw)} AS min_depth_was_negative`);
  c1.push(`${depthWasNeg(maxDepthRaw)} AS max_depth_was_negative`);

  const isPercentUnit = (u: string | null | undefined) => !!u && ['%', '%v', '%w'].includes(u);

  for (const [prop, cfg] of props) {
    const rawText = `raw.${prop}::text`;
    const rawNum = `(raw.${prop})::numeric`;
    const formula = cfg.conversion_formula?.replace(/"/g, '').trim() ?? null;
    const converted = formula ? formula.replace(/x/g, rawNum) : rawNum;

    const minVal = cfg.min_val ?? 0;
    let maxExpr: string | undefined;
    if (cfg.max_val != null) {
      maxExpr = p(cfg.max_val);
    } else if (isPercentUnit(cfg.standard_unit)) {
      maxExpr = p(100);
    } else if (isPercentUnit(cfg.original_unit)) {
      maxExpr = formula ? formula.replace(/x/g, '100.0') : p(100);
    }

    const inRange = maxExpr ? `(${converted}) BETWEEN ${p(minVal)} AND ${maxExpr}` : `(${converted}) >= ${p(minVal)}`;

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
    c1.push(formula && formula !== 'x' ? `(${isValid}) AS ${prop}_unit_converted` : `FALSE AS ${prop}_unit_converted`);

    c1.push(`((${isValid}) AND (${converted}) != ROUND((${converted}), 3)) AS ${prop}_value_rounded`);
  }

  // Full-row duplicate detection on raw (pre-cleaning) values so that an exact
  // copy of a row is tagged duplicate_row regardless of how its cells clean.
  const fullRowPartition = [
    'ST_AsBinary(raw.geometry)',
    minDepthRaw,
    maxDepthRaw,
    sdCol ? `raw.${sdCol}::text` : 'NULL::text',
    hzCol ? `raw.${hzCol}::text` : 'NULL::text',
    licCol ? `raw.${licCol}::text` : 'NULL::text',
    ...props.map(([prop]) => `raw.${prop}`),
  ].join(', ');
  c1.push(`ROW_NUMBER() OVER (PARTITION BY ${fullRowPartition} ORDER BY raw.record_id) AS _full_row_rn`);

  const cte1 = `cell_cleaned AS MATERIALIZED (
  SELECT
    ${c1.join(',\n    ')}
  FROM ${table} raw
)`;

  const c2Cols = [
    'cc.record_id',
    'cc.geom',
    'cc.sampling_date',
    'cc.horizon',
    'cc.license',
    'cc.min_depth',
    'cc.max_depth',
    'cc._full_row_rn',
    ...props.map(([prop]) => `cc.${prop}_cleaned`),
  ];

  const deleteEntries = [
    ...props.map(([prop]) => `'${prop}', cc.${prop}_cell_reason`),
    `'min_depth', CASE WHEN cc.min_depth_was_negative THEN '${CellDeleteReason.NEGATIVE_VALUE}'::text ELSE NULL END`,
    `'max_depth', CASE WHEN cc.max_depth_was_negative THEN '${CellDeleteReason.NEGATIVE_VALUE}'::text ELSE NULL END`,
  ].join(',\n      ');
  const cellDeleteReasons = `NULLIF(jsonb_strip_nulls(jsonb_build_object(
      ${deleteEntries}
    )), '{}'::jsonb) AS cell_delete_reasons`;

  const modifyEntries = [
    ...props.map(
      ([prop]) =>
        `'${prop}', NULLIF(to_jsonb(ARRAY_REMOVE(ARRAY[
        CASE WHEN cc.${prop}_unit_converted THEN '${CellModifyReason.UNIT_CONVERTED}'::text ELSE NULL END,
        CASE WHEN cc.${prop}_value_rounded  THEN '${CellModifyReason.VALUE_ROUNDED}'::text  ELSE NULL END
      ], NULL)), '[]'::jsonb)`,
    ),
    `'min_depth', CASE WHEN cc.min_depth_rounded THEN '["${CellModifyReason.DEPTH_ROUNDED}"]'::jsonb ELSE NULL END`,
    `'max_depth', CASE WHEN cc.max_depth_rounded THEN '["${CellModifyReason.DEPTH_ROUNDED}"]'::jsonb ELSE NULL END`,
  ].join(',\n      ');
  const cellModifyReasons = `NULLIF(jsonb_strip_nulls(jsonb_build_object(
      ${modifyEntries}
    )), '{}'::jsonb) AS cell_modify_reasons`;

  const cte2 = `cell_deduped AS MATERIALIZED (
  SELECT
    ${[...c2Cols, cellDeleteReasons, cellModifyReasons].join(',\n    ')}
  FROM cell_cleaned cc
)`;

  // Row-level checks; minimum-data-requirement uses the post-dedup cleaned values.
  const finalCleaned = props.length ? props.map(([p]) => `cd.${p}_cleaned`).join(', ') : 'NULL';

  const dropClause = config.drop_records?.length
    ? `WHEN cd.record_id IN (${config.drop_records.join(', ')}) THEN '${RowDeleteReason.USER_DELETION}'`
    : '';

  const cte3 = `cleaning_result AS MATERIALIZED (
  SELECT
    cd.*,
    CASE
      ${dropClause} 
      WHEN cd.geom IS NULL
        THEN '${RowDeleteReason.MINIMUM_DATA_REQUIREMENT}'
      WHEN ST_GeometryType(cd.geom)='ST_Point' AND (ST_X(cd.geom) NOT BETWEEN -180 AND 180
        OR ST_Y(cd.geom) NOT BETWEEN -90 AND 90) OR ST_GeometryType(cd.geom) IN ('ST_Polygon', 'ST_MultiPolygon') AND NOT ST_IsValid(cd.geom)
        THEN '${RowDeleteReason.INVALID_COORDINATES}'
      WHEN cd.min_depth IS NOT NULL
       AND cd.max_depth IS NOT NULL
       AND cd.min_depth >= cd.max_depth
        THEN '${RowDeleteReason.INVALID_DEPTH_INTERVAL}'
      WHEN cd._full_row_rn > 1
        THEN '${RowDeleteReason.DUPLICATE_ROW}'
      WHEN COALESCE(${finalCleaned}) IS NULL
        THEN '${RowDeleteReason.MINIMUM_DATA_REQUIREMENT}'
      ELSE NULL
    END AS final_row_delete_reason
  FROM cell_deduped cd
)`;

  const cte = [cte1, cte2, cte3].join(',\n');

  return {
    cte: `WITH\n${cte}`,
    values,
    propertyCols: props.map(([prop]) => prop),
  };
}
