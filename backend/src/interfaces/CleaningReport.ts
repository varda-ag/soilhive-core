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
}

export enum CellModifyReason {
  DEPTH_ROUNDED = 'depth_rounded',
  VALUE_ROUNDED = 'value_rounded',
  UNIT_CONVERTED = 'unit_converted',
}

export interface CleaningReport {
  summary: { values_modified: number; rows_deleted: number; cells_deleted: number };
  modifications: Array<{ reason: CellModifyReason; count: number }>;
  row_deletions: Array<{ reason: RowDeleteReason; count: number }>;
  cell_deletions: Array<{ reason: CellDeleteReason; count: number; property?: string }>;
}
