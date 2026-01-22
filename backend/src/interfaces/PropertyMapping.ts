export interface PropertyMapping {
  property_slug: string;
  conversion_slug?: string;
  min_val?: number;
  max_val?: number;
  procedure_slug?: string;
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
