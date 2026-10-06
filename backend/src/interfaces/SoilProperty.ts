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
  classes?: SoilPropertyClasses | null;
  original_units_of_measurement: Record<string, string>; // Record<slug, name>
}

export interface SoilPropertyClass {
  label: string;
  aliases?: string[];
}

/**
 * Class codes of a categorical property, keyed by the integer code as a string (jsonb keys are
 * text): {"1": {"label": "Clay"}, ...}. Synced from 4g-soil-property-classes-table.csv.
 */
export type SoilPropertyClasses = Record<string, SoilPropertyClass>;
