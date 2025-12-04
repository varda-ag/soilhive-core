import type { Polygon } from "geojson";
import type { GISDataTypeType } from "../types/data";

export interface License {
  name: string;
  url: string;
  citation?: string;
}

export interface VariableMeasured {
  description: string;
  soil_parameter: string;
  analytical_tool: string;
  analytical_method: string;
  limit_of_detection: string;
  reference_standard: string;
  soil_parameter_code: string;
  unit_of_measurement: string;
}

export interface IDataset {
  id: string;
  slug: string;
  name: string;
  full_name?: string;
  version?: string;
  author?: string;
  description?: string;
  data_producer?: string;
  variables_measured?: VariableMeasured[];
  spatial_resolution?: string;
  publication_date?: Date;
  reference_period_start?: string;
  reference_period_stop?: string;
  licenses?: License[];
  citation?: string;
  geographical_extent?: string;
  gis_datatype?: GISDataTypeType;
  spatial_extent: Polygon;
  n_observations?: string;
  n_raster_layers?: number;
  soil_depth?: object;
  status: string;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date | null;
  created_by: string;
  updated_by?: string;
  service_location?: string;
}
