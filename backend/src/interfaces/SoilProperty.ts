export interface SoilProperty {
  id: string;
  slug: string;
  property_name: string;
  property_acronym: string;
  description?: string;
  standard_unit?: string;
  property_level?: number;
  parent_property_id?: string;
  category_id: string;
  original_units_of_measurement: Record<string, string>; // Record<slug, name>
}
