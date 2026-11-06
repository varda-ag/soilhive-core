import type { Polygon } from 'geojson';
import { GISDataType, IngestionStatus } from '../types/data';
import { Capability } from '../types/enums';
import { CleaningReport } from './CleaningReport';
import { QueuedJob } from './Job';
import type { Envelope } from '../utils/GdalCLI';

export interface MeasuredProperty {
  soil_property_id: string;
  procedure_id: string;
}

export interface ProcessingSteps {
  description?: string;
  cleaning_steps?: Record<string, CleaningReport>;
}

/** A Dataset's open Version, as the admin listing shows it on the Dataset (docs/adr/0075) */
export interface PendingVersion {
  slug: string;
  // `<v1 name> v<number> increment`: too long for the list's cell, shown as its tooltip
  name: string;
  number: number;
  status: IngestionStatus;
  queued_job: QueuedJob | null;
  active_job: QueuedJob | null;
  updated_at: Date | null;
  // A version-publish of it is queued or running (DatasetJobs.getPublishingVersions)
  publishing: boolean;
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
  visibility: 'public' | 'private';
  inferred_properties?: string[] | null;
  preprocessing_steps?: string | null;
  related_resources?: string[] | null;
  queued_job?: QueuedJob | null;
  active_job?: QueuedJob | null;
  bbox?: Envelope | null; // [west, south, east, north], west > east across the antimeridian
  version_of?: string | null;
  version_number: number;
  data_updated_at?: Date | null;
  pending_version?: PendingVersion | null;
}
