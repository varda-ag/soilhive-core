import type { Polygon } from 'geojson';
import { GISDataType, IngestionStatus } from '../types/data';

export interface MeasuredProperty {
  soil_parameter_slug: string;
  procedure_slug: string;
}

export interface Dataset {
  id: string;
  slug: string;
  name: string;
  full_name?: string;
  version?: string;
  author?: string;
  description?: string;
  data_producer?: string;
  measured_properties?: MeasuredProperty[];
  spatial_resolution?: string;
  publication_date?: string;
  reference_period_start?: string;
  reference_period_stop?: string;
  licenses?: string[];
  citation?: string;
  geographical_extent?: string;
  gis_datatype?: GISDataType;
  spatial_extent: Polygon;
  n_observations?: string;
  n_raster_layers?: number;
  soil_depth?: object;
  status: IngestionStatus;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string;
  service_location?: string;
}
