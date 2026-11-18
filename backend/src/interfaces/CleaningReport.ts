import { GISDataType } from '../types/data';

export enum RowDeleteReason {
  MIXED_DATA_TYPE = 'mixed_data_type',
  INVALID_COORDINATES = 'invalid_coordinates',
  INVALID_DEPTH_INTERVAL = 'invalid_depth_interval',
  MINIMUM_DATA_REQUIREMENT = 'minimum_data_requirement',
  DUPLICATE_ROW = 'duplicate_row',
  USER_DELETION = 'user_deletion',
}

export enum CellDeleteReason {
  NON_NUMERIC = 'non_numeric',
  NEGATIVE_VALUE = 'negative_value',
  ZERO_VALUE = 'zero_value',
  OOB = 'out_of_bounds',
  BELOW_LOD = 'below_lod',
  UNKNOWN_CLASS = 'unknown_class',
}

export enum CellModifyReason {
  DEPTH_ROUNDED = 'depth_rounded',
  VALUE_ROUNDED = 'value_rounded',
  UNIT_CONVERTED = 'unit_converted',
  LABEL_RESOLVED = 'label_resolved',
}

/**
 * What the pivot of a long File left out, in rows of the File (docs/adr/0081). Each row is counted
 * once, under the first reason that applies, so the values passed on to the cleaning are
 * source_rows less the rest.
 */
export interface LongFormatStats {
  source_rows: number; // Rows read from the File
  empty_value_rows: number; // Rows with no value
  empty_property_rows: number; // Rows with no property code
  unmapped_measurement_type_rows: number; // Rows of Measurement Types the user did not map
  repeated_values_removed: number; // Same location, depth, Measurement Type and value more than once
}

export interface CleaningReport {
  summary: { values_modified: number; rows_deleted: number; cells_deleted: number };
  gis_datatype: GISDataType | null;
  modifications: Array<{ reason: CellModifyReason; count: number }>;
  row_deletions: Array<{ reason: RowDeleteReason; count: number }>;
  cell_deletions: Array<{ reason: CellDeleteReason; count: number; property?: string }>;
  long_format?: LongFormatStats; // Only for a long File
}
