import { LongRoleColumns, MeasurementTypeMatchKey } from '../types/DataMapping';
import { matchColumns } from '../utils/longFormat';
import { getLongTableName } from '../utils/utils';
import { NUMERIC_RE, quote } from './LongPivot';

interface MeasurementTypesQuery {
  sql: string;
  values: unknown[];
  /** The match key each `k<n>` column of a result row stands for, in order. */
  keys: MeasurementTypeMatchKey[];
  /** The columns of the long table the query reads. */
  sourceColumns: string[];
}

/**
 * The statement that lists the Measurement Types of a staged long File: one row per combination
 * of its role columns, with the number of rows, the lowest and highest numeric value and the
 * number of values that are no number (docs/adr/0081).
 *
 * Cells are trimmed and an empty one is null, as in the pivot, so a `match` built from a row
 * finds the same rows there. Rows with no value are left out, and with a property column so are
 * rows with no property code: the pivot loads neither.
 *
 * The column names go into the statement quoted; the caller checks them against the table first.
 */
export function buildMeasurementTypesQuery(roles: LongRoleColumns, fileId: string, limit: number): MeasurementTypesQuery {
  const longTable = `${quote(process.env.POSTGRES_SCHEMA!)}.${quote(getLongTableName(fileId))}`;
  const text = (column: string) => `NULLIF(btrim(l.${quote(column)}::text), '')`;
  const columns = matchColumns(roles);
  const keyNames = columns.map((_, i) => `k${i}`);
  const numeric = `CASE WHEN s.v ~ ${NUMERIC_RE} THEN s.v::numeric END`;

  const sql = `SELECT
  ${keyNames.map(k => `s.${k}, `).join('')}COUNT(*)::int AS row_count,
  MIN(${numeric}) AS min_value,
  MAX(${numeric}) AS max_value,
  (COUNT(*) FILTER (WHERE s.v !~ ${NUMERIC_RE}))::int AS non_numeric_count
FROM (
  SELECT ${columns.map(([, column], i) => `${text(column)} AS ${keyNames[i]}, `).join('')}${text(roles.value_col)} AS v
  FROM ${longTable} l
) s
WHERE s.v IS NOT NULL${roles.property_col ? ' AND s.k0 IS NOT NULL' : ''}${
    keyNames.length > 0
      ? `
GROUP BY ${keyNames.map(k => `s.${k}`).join(', ')}
ORDER BY ${keyNames.map(k => `s.${k} NULLS FIRST`).join(', ')}`
      : `
HAVING COUNT(*) > 0`
  }
LIMIT $1`;

  return {
    sql,
    values: [limit],
    keys: columns.map(([key]) => key),
    sourceColumns: [...new Set([...columns.map(([, column]) => column), roles.value_col])],
  };
}
