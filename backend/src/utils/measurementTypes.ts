import { DataMappingObject, LongRoleColumns, MeasurementTypeMapping, MeasurementTypeMatchKey } from '../types/DataMapping';
import { PropertyMapping } from '../interfaces/PropertyMapping';
import { ProcedureField } from '../types/data';
import { PROCEDURE_FIELDS, isLongMapping, matchColumns, normalizeMatchValue } from './longFormat';

/** The answers put forward for one Measurement Type. The ids are slugs, as a mapping holds them. */
export interface MeasurementTypeSuggestion extends Partial<PropertyMapping> {
  // Entries of the fixed lists that the File's own procedure values are equal to, by procedure
  // field. Left out when an earlier mapping gave a procedure_id.
  procedure?: Partial<Record<ProcedureField, string>>;
}

/** One Measurement Type found in a long File (docs/adr/0081). */
export interface FoundMeasurementType {
  match: Partial<Record<MeasurementTypeMatchKey, string | null>>; // One entry per role column; null for an empty cell
  row_count: number; // Rows with a value
  min_value: number | null; // Over the numeric values; null when there is none
  max_value: number | null;
  non_numeric_count: number;
  suggestion?: MeasurementTypeSuggestion;
}

/** What suggestions are read from. */
export interface SuggestionSources {
  mappings: DataMappingObject[]; // Earlier mappings, newest first
  properties: { id: string; slug: string; property_name: string; property_acronym: string }[];
  conversions: { slug: string; property_id: string; original_unit_of_measurement?: string }[];
  procedures: string[]; // Slugs
  vocabulary: Partial<Record<ProcedureField, string[]>>; // The fixed list of each procedure field
  fixedProperty?: string; // Slug of the Soil Property of the whole File, when it has no property column
}

// Compared with case and spaces ignored
const comparable = (value: unknown): string | null => normalizeMatchValue(value)?.toLowerCase().replace(/\s+/g, '') ?? null;

const same = (a: unknown, b: unknown): boolean => comparable(a) === comparable(b);

/** The one entry the test holds for, or undefined when it holds for none or for several. */
const only = <T>(items: T[], test: (item: T) => boolean): T | undefined => {
  const found = items.filter(test);
  return found.length === 1 ? found[0] : undefined;
};

/**
 * The answer an earlier long mapping gave to a Measurement Type with the same property code, and
 * the same unit when the File has a unit column. One that names another method code or procedure
 * value is passed over; of the rest, the one that agrees on the most of them wins, then the newest.
 */
const earlierAnswer = (
  match: FoundMeasurementType['match'],
  roles: LongRoleColumns,
  sources: SuggestionSources,
): MeasurementTypeMapping | undefined => {
  if (normalizeMatchValue(match.property) === null) return undefined;
  const otherKeys: MeasurementTypeMatchKey[] = ['method_code', ...PROCEDURE_FIELDS];
  let best: MeasurementTypeMapping | undefined;
  let bestScore = -1;
  for (const mapping of sources.mappings) {
    if (!isLongMapping(mapping) || !Array.isArray(mapping.long_format!.measurement_types)) continue;
    for (const earlier of mapping.long_format!.measurement_types) {
      if (!earlier?.match || !same(earlier.match.property, match.property)) continue;
      if (roles.unit_col && !same(earlier.match.unit, match.unit)) continue;
      if (!sources.properties.some(p => p.slug === earlier.property_id)) continue;
      const shared = otherKeys.filter(key => comparable(earlier.match[key]) !== null && comparable(match[key]) !== null);
      if (shared.some(key => !same(earlier.match[key], match[key]))) continue;
      if (shared.length > bestScore) {
        best = earlier;
        bestScore = shared.length;
      }
    }
  }
  return best;
};

/**
 * Suggested answers for one Measurement Type, or undefined when there is none. In this order:
 * 1. what an earlier long mapping answered for the same property code (and unit);
 * 2. a property code equal to a Soil Property's slug, name or acronym; a unit equal to the
 *    original unit of one of that property's conversions; a procedure value equal to an entry of
 *    its fixed list.
 * Slugs that no longer exist are not suggested.
 */
export const suggestMeasurementType = (
  match: FoundMeasurementType['match'],
  roles: LongRoleColumns,
  sources: SuggestionSources,
): MeasurementTypeSuggestion | undefined => {
  const suggestion: MeasurementTypeSuggestion = {};
  const { properties, conversions } = sources;

  const earlier = earlierAnswer(match, roles, sources);
  let property = earlier && properties.find(p => p.slug === earlier.property_id);
  if (earlier && property) {
    suggestion.property_id = property.slug;
    const propertyId = property.id;
    if (conversions.some(c => c.slug === earlier.conversion_id && c.property_id === propertyId)) {
      suggestion.conversion_id = earlier.conversion_id!;
    }
    if (earlier.procedure_id && sources.procedures.includes(earlier.procedure_id)) {
      suggestion.procedure_id = earlier.procedure_id;
    }
    if (earlier.min_val !== undefined) suggestion.min_val = earlier.min_val;
    if (earlier.max_val !== undefined) suggestion.max_val = earlier.max_val;
  } else if (sources.fixedProperty) {
    // The user picked it for the whole File, so it is not suggested back
    property = properties.find(p => p.slug === sources.fixedProperty);
  } else if (comparable(match.property) !== null) {
    property =
      only(properties, p => same(p.slug, match.property)) ??
      only(properties, p => same(p.property_name, match.property)) ??
      only(properties, p => same(p.property_acronym, match.property));
    if (property) suggestion.property_id = property.slug;
  }

  if (property && !suggestion.conversion_id && comparable(match.unit) !== null) {
    const propertyId = property.id;
    const conversion = conversions.find(c => c.property_id === propertyId && same(c.original_unit_of_measurement, match.unit));
    if (conversion) suggestion.conversion_id = conversion.slug;
  }

  if (!suggestion.procedure_id) {
    const procedure: Partial<Record<ProcedureField, string>> = {};
    for (const [key] of matchColumns(roles)) {
      if (key === 'property' || key === 'unit' || key === 'method_code' || comparable(match[key]) === null) continue;
      const entry = sources.vocabulary[key]?.find(e => same(e, match[key]));
      if (entry) procedure[key] = entry;
    }
    if (Object.keys(procedure).length > 0) suggestion.procedure = procedure;
  }

  return Object.keys(suggestion).length > 0 ? suggestion : undefined;
};
