import type { Polygon } from 'geojson';
import { GISDataType, IngestionStatus } from '../types/data';
import { Capability } from '../types/enums';

export interface MeasuredProperty {
  soil_property_id: string;
  procedure_id: string;
}

export interface Dataset {
  id: string;
  slug: string;
  name: string;
  full_name?: string | null;
  version?: string | null;
  author?: string | null;
  description?: string | null;
  data_producer?: string | null;
  measured_properties?: MeasuredProperty[] | null;
  spatial_resolution?: string | null;
  publication_date?: string | null;
  reference_period_start?: string | null;
  reference_period_stop?: string | null;
  licenses?: string[] | null;
  citation?: string | null;
  geographical_extent?: string | null;
  gis_datatype?: GISDataType | null;
  spatial_extent: Polygon | null;
  n_observations?: string | null;
  n_raster_layers?: number | null;
  soil_depth?: object | null;
  status: IngestionStatus;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string | null;
  service_location?: string | null;
  capabilities?: Capability[];
}
