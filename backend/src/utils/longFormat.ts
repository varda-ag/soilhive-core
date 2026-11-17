import {
  DataMappingObject,
  DetectableFields,
  LongFormatMapping,
  LongRoleColumns,
  MAX_MEASUREMENT_TYPES,
  MeasurementTypeMapping,
  MeasurementTypeMatchKey,
} from '../types/DataMapping';
import { ProcedureField, VocabularyType } from '../types/data';
import { sanitizeField } from './utils';

export const PROCEDURE_FIELDS: ProcedureField[] = ['technique', ...Object.values(VocabularyType)];

// The mapping keys that are not source columns
const RESERVED_KEYS = ['drop_records', 'long_format'];

const GEOMETRY_ROLES: string[] = [DetectableFields.GEOMETRY, DetectableFields.LATITUDE, DetectableFields.LONGITUDE];

const COL_RE = /^s[1-9][0-9]*$/;

const isFilled = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** Whether the mapping is of a long File. A string under the same key is a source column of that name. */
export const isLongMapping = (mapping: DataMappingObject): boolean =>
  mapping.long_format !== null && typeof mapping.long_format === 'object';

/**
 * The role columns that tell Measurement Types apart, as [match key, source column], always in
 * this order: a Measurement Type's key is its match values in the same order.
 */
export const matchColumns = (long: LongRoleColumns): [MeasurementTypeMatchKey, string][] => {
  const columns: [MeasurementTypeMatchKey, string][] = [];
  if (long.property_col) columns.push(['property', long.property_col]);
  if (long.unit_col) columns.push(['unit', long.unit_col]);
  if (long.method_code_col) columns.push(['method_code', long.method_code_col]);
  for (const field of PROCEDURE_FIELDS) {
    const column = long.procedure_cols?.[field];
    if (column) columns.push([field, column]);
  }
  return columns;
};

/** A cell as it is compared: trimmed, and null when empty. The pivot does the same in SQL. */
export const normalizeMatchValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

/** A Measurement Type's key: its match values in the order of the role columns. */
export const matchKey = (long: LongFormatMapping, measurementType: MeasurementTypeMapping): (string | null)[] =>
  matchColumns(long).map(([key]) => normalizeMatchValue(measurementType.match?.[key]));

/** The metadata columns of a mapping, geometry left out, as [source column, role]. */
export const metadataEntries = (mapping: DataMappingObject): [string, string][] =>
  Object.entries(mapping).filter(
    (entry): entry is [string, string] =>
      !RESERVED_KEYS.includes(entry[0]) && typeof entry[1] === 'string' && !GEOMETRY_ROLES.includes(entry[1]),
  );

/** What is wrong with the `long_format` of a mapping, or null when it can be pivoted. */
export const longFormatProblem = (mapping: DataMappingObject): string | null => {
  const long = mapping.long_format;
  if (long === null || typeof long !== 'object' || Array.isArray(long)) {
    return 'long_format must be an object';
  }
  if (!isFilled(long.value_col)) {
    return 'long_format.value_col is required';
  }
  if (isFilled(long.property_col) === isFilled(long.fixed_property_id)) {
    return 'long_format needs either property_col or fixed_property_id, and not both';
  }
  if (!Array.isArray(long.measurement_types) || long.measurement_types.length === 0) {
    return 'long_format.measurement_types must list at least one measurement type';
  }
  if (long.measurement_types.length > MAX_MEASUREMENT_TYPES) {
    return `long_format.measurement_types holds more than ${MAX_MEASUREMENT_TYPES} measurement types`;
  }
  // The pivot builds every property column from the measurement types
  const propertyColumn = Object.keys(mapping).find(key => !RESERVED_KEYS.includes(key) && typeof mapping[key] === 'object');
  if (propertyColumn) {
    return `Column '${propertyColumn}' is mapped to a soil property: a long mapping maps measurement types, not columns`;
  }

  const metadataColumns = new Set(metadataEntries(mapping).map(([column]) => sanitizeField(column)));
  const cols = new Set<string>();
  const keys = new Set<string>();
  for (const measurementType of long.measurement_types) {
    const { col } = measurementType ?? {};
    if (typeof col !== 'string' || !COL_RE.test(col)) {
      return `Measurement type column '${col}' must be 's' followed by a number, such as s1`;
    }
    if (cols.has(col)) {
      return `Measurement type column '${col}' is used more than once`;
    }
    if (metadataColumns.has(col)) {
      return `Measurement type column '${col}' has the name of a mapped column of the file`;
    }
    cols.add(col);
    if (!isFilled(measurementType.property_id) && !isFilled(long.fixed_property_id)) {
      return `Measurement type '${col}' has no property_id`;
    }
    if (
      isFilled(long.fixed_property_id) &&
      isFilled(measurementType.property_id) &&
      measurementType.property_id !== long.fixed_property_id
    ) {
      return `Measurement type '${col}' names another property than fixed_property_id`;
    }
    if (measurementType.match === null || typeof measurementType.match !== 'object' || Array.isArray(measurementType.match)) {
      return `Measurement type '${col}' has no match`;
    }
    if (isFilled(long.property_col) && normalizeMatchValue(measurementType.match.property) === null) {
      return `Measurement type '${col}' has no match.property`;
    }
    const key = JSON.stringify(matchKey(long, measurementType));
    if (keys.has(key)) {
      return `Measurement type '${col}' has the same match as another one`;
    }
    keys.add(key);
  }
  return null;
};
