import { LongRoles, ProcedureField, VectorFormat } from '../interfaces/File';
import { DetectableFields } from '../types/DataMapping';
import { OgrSampleFeature } from './GdalCLI';

/** Rows read from the top of a File to suggest its shape (docs/adr/0081). */
export const SHAPE_SAMPLE_ROWS = 500;

/** The values a unit column or a procedure column may hold, as the vocabularies spell them. */
export interface ShapeVocabulary {
  units: string[];
  procedure: Partial<Record<ProcedureField, string[]>>;
}

export interface ShapeSuggestion {
  format: VectorFormat;
  roles?: LongRoles; // Only for a long File
}

// A column is numeric when more than this share of its filled cells are numbers
const NUMERIC_SHARE = 0.5;
// A column holds vocabulary values when at least this share of its distinct values are entries of it
const VOCABULARY_SHARE = 0.8;
// Rows per location and depth, on average, from which a File is read as repeating them
const MIN_ROWS_PER_GROUP = 1.5;
// A property column names a different property on at least this share of the rows of one location and depth
const DISTINCT_IN_GROUP_SHARE = 0.9;
// A property code comes back at least this many times in the sample, on average
const MIN_ROWS_PER_CODE = 2;

// Compared against a column name with everything but letters removed. The short ones are the
// column titles an export writes to a Shapefile (EXPORT_SCHEMA.title_truncated).
const PROCEDURE_COLUMN_NAMES: Record<ProcedureField, string[]> = {
  sample_pretreatment: ['samplepretreatment', 'pretreatment', 'pretreat'],
  technique: ['technique'],
  laboratory_method: ['laboratorymethod', 'labmethod'],
  extractant_concentration: ['extractantconcentration', 'extraccon'],
  extraction_ratio: ['extractionratio', 'ratio'],
  extraction_base: ['extractionbase', 'base'],
  measurement_procedure: ['measurementprocedure', 'measure'],
  limit_of_detection: ['limitofdetection', 'lod'],
};

// Compared against the words of a column name
const UNIT_WORDS = ['unit', 'units', 'uom'];
const VALUE_WORDS = ['value', 'result', 'val', 'reading'];
const PROPERTY_WORDS = ['property', 'parameter', 'param', 'analyte', 'variable', 'determinand', 'indicator'];
const METHOD_CODE_WORDS = ['method', 'procedure'];

interface ColumnProfile {
  name: string;
  filled: number;
  numeric: boolean;
  values: Set<string>; // Distinct filled values, trimmed and in lower case
}

const isEmpty = (value: unknown): boolean => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const isNumber = (value: unknown): boolean =>
  typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && Number.isFinite(Number(value));

const normalize = (value: unknown): string => String(value).trim().toLowerCase();

/** `soilProperty_code` → ['soil', 'property', 'code'] */
const words = (name: string): string[] =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

const hasWord = (name: string, expected: string[]): boolean => words(name).some(w => expected.includes(w));

const profileColumn = (name: string, features: OgrSampleFeature[]): ColumnProfile | null => {
  const values = new Set<string>();
  let filled = 0;
  let numeric = 0;
  for (const { properties } of features) {
    const value = properties[name];
    if (isEmpty(value)) continue;
    // A nested value (GeoJSON) is no role column
    if (typeof value === 'object') return null;
    filled++;
    if (isNumber(value)) numeric++;
    values.add(normalize(value));
  }
  if (filled === 0) return null;
  return { name, filled, numeric: numeric / filled > NUMERIC_SHARE, values };
};

const holdsVocabulary = (column: ColumnProfile, entries: string[] | undefined): boolean => {
  if (!entries || entries.length === 0) return false;
  const known = new Set(entries.map(normalize));
  let matched = 0;
  for (const value of column.values) {
    if (known.has(value)) matched++;
  }
  return matched / column.values.size >= VOCABULARY_SHARE;
};

/**
 * One key per row for what a wide File has one row of: a location, a depth, a date and a horizon.
 * null when the File names no location and no depth, so rows cannot be told apart this way.
 */
const groupKeys = (features: OgrSampleFeature[], detected: Record<DetectableFields, string | null>): string[] | null => {
  const hasGeometry = features.some(f => f.geometry);
  const locationCols = [detected.geometry, detected.latitude, detected.longitude].filter((c): c is string => !!c);
  const depthCols = [detected.depth, detected.min_depth, detected.max_depth].filter((c): c is string => !!c);
  if (!hasGeometry && locationCols.length === 0 && depthCols.length === 0) return null;

  const cols = [...locationCols, ...depthCols, detected.sampling_date, detected.horizon].filter((c): c is string => !!c);
  return features.map(f => JSON.stringify([f.geometry ?? null, ...cols.map(c => f.properties[c] ?? null)]));
};

/**
 * Suggests whether a vector File is wide (one column per property) or long (one row per measured
 * value), and for a long one which column plays which role. Decided on the content of a sample of
 * rows; column names only pick between columns the content leaves equal (docs/adr/0081).
 *
 * A long File is one of:
 * - a property column and a value column: the same location and depth repeat, each time under
 *   another code of a text column, with one numeric column left for the value;
 * - no property column: one value column next to a unit column or procedure columns. The user
 *   then sets the property for the whole File.
 */
export const suggestShape = (
  fieldNames: string[],
  features: OgrSampleFeature[],
  detected: Record<DetectableFields, string | null>,
  vocabulary: ShapeVocabulary,
): ShapeSuggestion => {
  const wide: ShapeSuggestion = { format: 'wide' };
  if (features.length === 0) return wide;

  const setAside = new Set(Object.values(detected).filter((c): c is string => !!c));
  let columns = fieldNames
    .filter(name => !setAside.has(name))
    .map(name => profileColumn(name, features))
    .filter((c): c is ColumnProfile => c !== null);
  const take = (column: ColumnProfile | undefined): string | null => {
    if (!column) return null;
    columns = columns.filter(c => c !== column);
    return column.name;
  };

  // Procedure and unit columns first: by name, then by what they hold
  const procedure_cols: LongRoles['procedure_cols'] = {};
  for (const field of Object.keys(PROCEDURE_COLUMN_NAMES) as ProcedureField[]) {
    const expected = PROCEDURE_COLUMN_NAMES[field];
    const col =
      take(columns.find(c => expected.includes(words(c.name).join('')))) ??
      take(columns.find(c => !c.numeric && holdsVocabulary(c, vocabulary.procedure[field])));
    if (col) procedure_cols[field] = col;
  }
  const unit_col =
    take(columns.find(c => !c.numeric && hasWord(c.name, UNIT_WORDS))) ??
    take(columns.find(c => !c.numeric && holdsVocabulary(c, vocabulary.units)));

  // Property column: within one location and depth its codes differ from row to row
  const keys = groupKeys(features, detected);
  const repeats = keys !== null && features.length / new Set(keys).size >= MIN_ROWS_PER_GROUP;
  const namesProperty = (c: ColumnProfile) => hasWord(c.name, PROPERTY_WORDS);
  const fewCodes = (c: ColumnProfile) => c.values.size >= 2 && c.filled / c.values.size >= MIN_ROWS_PER_CODE;
  const differsInGroup = (c: ColumnProfile): boolean => {
    const pairs = new Set<string>();
    features.forEach((f, i) => {
      const value = f.properties[c.name];
      if (!isEmpty(value)) pairs.add(`${keys![i]}|${normalize(value)}`);
    });
    return pairs.size / c.filled >= DISTINCT_IN_GROUP_SHARE;
  };
  let propertyCandidates: ColumnProfile[];
  if (repeats) {
    // A numeric column is read as a code only when its name says so: values differ within a group too
    propertyCandidates = columns.filter(c => (!c.numeric || namesProperty(c)) && fewCodes(c) && differsInGroup(c));
  } else if (keys === null) {
    // Nothing to tell repeated rows by, so only the name is left
    propertyCandidates = columns.filter(c => namesProperty(c) && fewCodes(c));
  } else {
    propertyCandidates = [];
  }
  // The name first, then the fewest codes: an id column passes the same test with one code per row
  propertyCandidates.sort((a, b) => Number(namesProperty(b)) - Number(namesProperty(a)) || a.values.size - b.values.size);
  const property_col = take(propertyCandidates[0]);

  // Value column: the one numeric column left
  const namesValue = (c: ColumnProfile) => hasWord(c.name, VALUE_WORDS);
  const numericCols = columns.filter(c => c.numeric);
  let valueCandidates = numericCols.filter(namesValue);
  if (valueCandidates.length === 0 && numericCols.length === 0) {
    // A File of class labels only has no numeric column
    valueCandidates = columns.filter(namesValue);
  }
  if (valueCandidates.length === 0) {
    valueCandidates = numericCols;
    if (property_col && repeats && valueCandidates.length > 1) {
      // A sample or site number stays the same within one location and depth; a value does not
      valueCandidates = valueCandidates.filter(c => {
        const byGroup = new Map<string, string>();
        return features.some((f, i) => {
          const value = f.properties[c.name];
          if (isEmpty(value)) return false;
          const seen = byGroup.get(keys![i]!);
          if (seen === undefined) byGroup.set(keys![i]!, normalize(value));
          return seen !== undefined && seen !== normalize(value);
        });
      });
    }
  }
  if (valueCandidates.length !== 1) return wide;
  const value_col = take(valueCandidates[0]);

  const method_code_col = take(columns.find(c => !c.numeric && hasWord(c.name, METHOD_CODE_WORDS)));

  // One value column and nothing that describes it is a wide File with one property column
  if (!property_col && !unit_col && !method_code_col && Object.keys(procedure_cols).length === 0) return wide;

  return { format: 'long', roles: { property_col, value_col, unit_col, method_code_col, procedure_cols } };
};
