export interface PropertyMapping {
  property_id: string;
  conversion_id?: string;
  min_val?: number;
  max_val?: number;
  procedure_id?: string;
}

export interface PropertyCleaningConfig extends PropertyMapping {
  conversion_formula?: string;
  standard_unit?: string;
  original_unit?: string;
}
