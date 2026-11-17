import { EntityManager } from 'typeorm';
import { DataMappingObject, DetectableFields } from '../types/DataMapping';
import { matchColumns, matchKey, metadataEntries } from '../utils/longFormat';
import { getLongTableName, getRawTableName, sanitizeField } from '../utils/utils';

interface LongPivot {
  /** Creates the raw table, empty. */
  createSql: string;
  /** Fills it from the long table. */
  insertSql: string;
  /** Counts the rows of the long table the pivot leaves out, as LongFormatStats. */
  statsSql: string;
  /** For both insertSql and statsSql. */
  values: unknown[];
  /** The columns of the long table the pivot reads. */
  sourceColumns: string[];
}

export const NUMERIC_RE = `'^-?[0-9]+(\\.[0-9]+)?$'`;

export const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/**
 * work_mem for the statements that group the rows of a long table. The planner multiplies the
 * distinct values of each role column as if they were unrelated, so it expects about one group
 * per row where a File has a few dozen. With the default 4MB it then sorts every row on disk
 * instead of grouping in memory. 32MB keeps the grouping in memory up to 570k rows, measured.
 * A limit, not memory taken: the few real groups use far less.
 */
const LONG_WORK_MEM = '32MB';

/** Runs `run` in a transaction where work_mem is LONG_WORK_MEM. SET LOCAL ends with the transaction. */
export const withLongWorkMem = <T>(entityManager: EntityManager, run: (tx: EntityManager) => Promise<T>): Promise<T> =>
  entityManager.transaction(async tx => {
    await tx.query(`SET LOCAL work_mem = '${LONG_WORK_MEM}'`);
    return run(tx);
  });

/**
 * The statements that pivot a staged long File into the raw table a wide File gets: one row per
 * location, depth, date, license and horizon, and one text column per mapped Measurement Type
 * (docs/adr/0081). The mapping must have passed longFormatProblem.
 *
 * - Rows are grouped by geometry and every metadata column. A second value of one Measurement
 *   Type in a group goes to an extra row; an exact repeat is removed.
 * - `record_id` is a row number of the source: the first row of the group, or for an extra row
 *   the first row that put a value on it. It is worked out over every row, mapped or not, so it
 *   stays the same when the mapped Measurement Types change, and `drop_records` keep their rows.
 * - Rows of a Measurement Type the mapping does not list, and rows with no value, are left out.
 *   statsSql counts them, for the preview stats.
 */
export function buildLongPivot(mapping: DataMappingObject, fileId: string): LongPivot {
  const schema = process.env.POSTGRES_SCHEMA;
  const long = mapping.long_format!;
  const rawTable = `${quote(schema!)}.${quote(getRawTableName(fileId))}`;
  const longTable = `${quote(schema!)}.${quote(getLongTableName(fileId))}`;
  const values: unknown[] = [];
  const p = (val: unknown) => {
    values.push(val);
    return `$${values.length}`;
  };
  const text = (column: string) => `NULLIF(btrim(l.${quote(column)}::text), '')`;

  // Named as file-to-db names the columns of a wide File, so the cleaning config finds them
  const metadata = metadataEntries(mapping).map(([column, role]) => {
    const numeric = role === DetectableFields.MIN_DEPTH || role === DetectableFields.MAX_DEPTH;
    return {
      name: sanitizeField(column),
      type: numeric ? 'numeric' : 'text',
      // The cleaning casts both depths to numeric, which a text that is no number would fail
      expression: numeric ? `CASE WHEN ${text(column)} ~ ${NUMERIC_RE} THEN ${text(column)}::numeric END` : text(column),
    };
  });
  const metadataNames = metadata.map(m => quote(m.name));
  const keyColumns = matchColumns(long).map(([, column]) => column);
  const cols = long.measurement_types.map(measurementType => measurementType.col);

  const createSql = `CREATE TABLE ${rawTable} (
  record_id integer PRIMARY KEY,
  geometry geometry${[...metadata.map(m => `,\n  ${quote(m.name)} ${m.type}`), ...cols.map(col => `,\n  ${col} text`)].join('')}
)`;

  const measurementTypes = long.measurement_types
    .map(
      measurementType =>
        `(${p(measurementType.col)}::text, ARRAY[${matchKey(long, measurementType)
          .map(value => p(value))
          .join(', ')}]::text[])`,
    )
    .join(',\n    ');

  // What both statements start from: the mapped Measurement Types, and each source row with its group
  const common = `WITH measurement_types (col, key) AS (
  VALUES
    ${measurementTypes}
),
src AS (
  SELECT
    l.source_id,
    l.geometry${metadata.map(m => `,\n    ${m.expression} AS ${quote(m.name)}`).join('')},
    ${text(long.value_col)} AS _value,
    ARRAY[${keyColumns.map(text).join(', ')}]::text[] AS _key
  FROM ${longTable} l
),
grouped AS (
  SELECT s.*, MIN(s.source_id) OVER (PARTITION BY ${['ST_AsBinary(s.geometry)', ...metadataNames.map(n => `s.${n}`)].join(', ')}) AS _group_id
  FROM src s
)`;

  const insertSql = `INSERT INTO ${rawTable} (record_id, geometry${[...metadataNames, ...cols].map(c => `, ${c}`).join('')})
${common},
placed AS (
  SELECT d.*, DENSE_RANK() OVER (PARTITION BY d._group_id, d._key ORDER BY d._first_id) AS _k
  FROM (
    SELECT _group_id, _key, _value, MIN(source_id) AS _first_id
    FROM grouped
    WHERE _value IS NOT NULL
    GROUP BY _group_id, _key, _value
  ) d
),
numbered AS (
  SELECT d.*, CASE WHEN d._k = 1 THEN d._group_id ELSE MIN(d._first_id) OVER (PARTITION BY d._group_id, d._k) END AS record_id
  FROM placed d
),
pivoted AS (
  SELECT
    n.record_id,
    n._group_id${cols.map(col => `,\n    MAX(n._value) FILTER (WHERE t.col = '${col}') AS ${col}`).join('')}
  FROM numbered n
  JOIN measurement_types t ON t.key = n._key
  GROUP BY n.record_id, n._group_id
),
groups AS (
  SELECT DISTINCT ON (_group_id) _group_id, geometry${metadataNames.map(n => `, ${n}`).join('')}
  FROM grouped
  ORDER BY _group_id
)
SELECT v.record_id, g.geometry${[...metadataNames.map(n => `g.${n}`), ...cols.map(col => `v.${col}`)].map(c => `, ${c}`).join('')}
FROM pivoted v
JOIN groups g USING (_group_id)`;

  // The key starts with the property code when there is a property column (matchColumns)
  const noProperty = long.property_col ? 'g._key[1] IS NULL' : 'false';
  const unmapped = 'NOT EXISTS (SELECT 1 FROM measurement_types t WHERE t.key = g._key)';
  // Each row is counted once, under the first reason that applies
  const statsSql = `${common},
mapped AS (
  SELECT COUNT(*) AS n
  FROM grouped g
  JOIN measurement_types t ON t.key = g._key
  WHERE g._value IS NOT NULL
  GROUP BY g._group_id, g._key, g._value
)
SELECT
  (SELECT COUNT(*) FROM grouped)::int AS source_rows,
  (SELECT COUNT(*) FROM grouped WHERE _value IS NULL)::int AS empty_value_rows,
  (SELECT COUNT(*) FROM grouped g WHERE g._value IS NOT NULL AND ${noProperty} AND ${unmapped})::int AS empty_property_rows,
  (SELECT COUNT(*) FROM grouped g WHERE g._value IS NOT NULL AND NOT (${noProperty}) AND ${unmapped})::int AS unmapped_measurement_type_rows,
  (SELECT COALESCE(SUM(n - 1), 0) FROM mapped)::int AS repeated_values_removed`;

  return {
    createSql,
    insertSql,
    statsSql,
    values,
    sourceColumns: [...new Set([long.value_col, ...keyColumns, ...metadataEntries(mapping).map(([column]) => column)])],
  };
}
