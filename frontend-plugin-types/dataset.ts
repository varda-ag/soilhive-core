export interface PluginMeasuredProperty {
  soil_property_id: string;
  procedure_id: string;
}

export interface PluginDataset {
  id: string;
  slug: string;
  name: string;
  full_name?: string | null;
  author?: string | null;
  description?: string | null;
  data_producer?: string | null;
  measured_properties?: PluginMeasuredProperty[] | null;
  visibility: 'public' | 'private';
  spatial_resolution?: string | null;
  publication_date?: string | null;
  reference_period_start?: string | null;
  reference_period_stop?: string | null;
  licenses?: string[] | null;
  geographical_extent?: string | null;
}
