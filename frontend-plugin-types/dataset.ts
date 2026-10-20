export type IngestionStatus = 'PENDING' | 'ONGOING' | 'STAGED' | 'LOADED' | 'PUBLISHED';

export type Capability = 'preview' | 'download' | 'obfuscate_as_points' | 'obfuscate_as_polygons' | 'read' | 'write';

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
  status: IngestionStatus;
  capabilities?: Capability[];
  visibility: 'public' | 'private';
  spatial_resolution?: string | null;
  publication_date?: string | null;
  reference_period_start?: string | null;
  reference_period_stop?: string | null;
  licenses?: string[] | null;
  geographical_extent?: string | null;
}
