export interface PropertyMapping {
  property_id: string;
  conversion_id?: string;
  min_val?: number;
  max_val?: number;
  procedure_id?: string;
}

export interface PropertyCleaningConfig extends PropertyMapping {
  conversion_formula?: string;
  procedure_id?: string;
  property_id: string;
}

export interface PropertyInfo {
  property_name: string;
  procedure_name?: string;
  min_val?: number;
  max_val?: number;
  original_unit?: string;
  standard_unit?: string;
  conversion_formula?: string;
}
