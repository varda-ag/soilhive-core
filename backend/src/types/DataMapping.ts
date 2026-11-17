import { PropertyMapping } from '../interfaces/PropertyMapping';
import type { ProcedureField } from './data';

export type DataMappingObject = {
  [key: string]: PropertyMapping | string; // dynamic entries for property columns (PropertyMapping values) and metadata columns (string values)
} & {
  drop_records?: number[]; // fixed entries
  long_format?: LongFormatMapping; // Its presence marks the mapping of a long File (docs/adr/0081)
};

/** What tells Measurement Types apart: the property code, the unit, a method code and the procedure fields. */
export type MeasurementTypeMatchKey = 'property' | 'unit' | 'method_code' | ProcedureField;

/**
 * One Measurement Type the user mapped. `match` holds the raw strings of the File that define it,
 * one per role column of the mapping; null or absent for an empty cell.
 */
export interface MeasurementTypeMapping extends Omit<PropertyMapping, 'property_id'> {
  col: string; // Its column in the raw table: s1, s2, ... Fixed once given
  match: Partial<Record<MeasurementTypeMatchKey, string | null>>;
  property_id?: string; // May be left out when the mapping sets fixed_property_id
}

/** The role columns of a long File and its mapped Measurement Types. One left unmapped is not listed, and not loaded. */
export interface LongFormatMapping {
  property_col?: string; // Column of local property codes. Left out when the File names no property
  fixed_property_id?: string; // The Soil Property of the whole File, set instead of property_col
  value_col: string;
  unit_col?: string;
  method_code_col?: string;
  procedure_cols?: Partial<Record<ProcedureField, string>>;
  measurement_types: MeasurementTypeMapping[];
}

/** Each Measurement Type is a column of the raw table, and PostgreSQL allows 1,600 columns per table. */
export const MAX_MEASUREMENT_TYPES = 100;

export enum DetectableFields {
  GEOMETRY = 'geometry',
  LICENSE = 'license',
  SAMPLING_DATE = 'sampling_date',
  DEPTH = 'depth',
  MIN_DEPTH = 'min_depth',
  MAX_DEPTH = 'max_depth',
  HORIZON = 'horizon',
  LATITUDE = 'latitude',
  LONGITUDE = 'longitude',
}

export enum LayerFields {
  LICENSE = 'license',
  SAMPLING_DATE = 'sampling_date',
  MIN_DEPTH = 'min_depth',
  MAX_DEPTH = 'max_depth',
  HORIZON = 'horizon',
}
