import { Entity, Column, PrimaryColumn, Unique, Index, ForeignKey, Check } from 'typeorm';
import type { Polygon } from 'typeorm';
import { Dataset, MeasuredProperty, PendingVersion, ProcessingSteps } from '../interfaces/Dataset';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import { GISDataType, IngestionStatus } from '../types/data';
import { Capability } from '../types/enums';
import { QueuedJob } from '../interfaces/Job';
import type { Envelope } from '../utils/GdalCLI';

@Entity('datasets')
@Unique(['name'])
@Unique(['slug'])
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
@ForeignKey(() => DatasetEntity, ['version_of'], ['id'])
@Check('CHK_datasets_version_not_published', `"version_of" IS NULL OR "status" <> 'PUBLISHED'`)
export default class DatasetEntity extends BaseTable implements Dataset {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  name: string;

  @Column({ type: 'text', nullable: true })
  full_name?: string | null;

  @Column({ type: 'text', nullable: true })
  version?: string | null;

  @Column({ type: 'text', nullable: true })
  author?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  data_producer?: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'variables_measured' }) // Keeping old column name
  measured_properties?: MeasuredProperty[] | null;

  @Column({ type: 'text', nullable: true })
  spatial_resolution?: string | null;

  @Column({ type: 'text', nullable: true })
  publication_date?: string | null;

  @Column({ type: 'text', nullable: true })
  reference_period_start?: string | null;

  @Column({ type: 'text', nullable: true })
  reference_period_stop?: string | null;

  @Column({ type: 'text', nullable: true, array: true })
  licenses?: string[] | null;

  @Column({ type: 'text', nullable: true })
  citation?: string | null;

  @Column({ type: 'text', nullable: true })
  geographical_extent?: string | null;

  @Column({ type: 'text', nullable: true })
  gis_datatype?: GISDataType | null;

  @Column({
    type: 'geometry',
    srid: 4326,
    spatialFeatureType: 'Polygon',
    nullable: true,
  })
  @Index({ spatial: true })
  spatial_extent: Polygon | null;

  @Column({ type: 'bigint', nullable: true })
  n_observations?: string | null; // bigint stored as string to avoid JS number precision issues

  @Column({ type: 'int', nullable: true })
  n_raster_layers?: number | null;

  @Column({ type: 'jsonb', nullable: true })
  soil_depth?: object | null;

  @Column({ type: 'text', default: IngestionStatus.PENDING })
  status: IngestionStatus;

  @Column({ type: 'text' })
  created_by: string;

  @Column({ type: 'text', nullable: true })
  updated_by?: string | null;

  @Column({ type: 'text', nullable: true })
  service_location?: string | null;

  @Column({ type: 'text', enum: ['public', 'private'], default: 'private' })
  visibility: 'public' | 'private';

  @Column({ type: 'text', nullable: true, array: true })
  inferred_properties?: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  processing_steps?: ProcessingSteps | null;

  @Column({ type: 'text', nullable: true, array: true })
  related_resources?: string[] | null;

  // The PUBLISHED Dataset this one is a Version of, or null (docs/backend/dataset-version-plan.md)
  @Column({ type: 'uuid', nullable: true })
  @Index('IDX_datasets_version_of_open', { unique: true, where: '"version_of" IS NOT NULL AND "deleted_at" IS NULL' })
  version_of?: string | null;

  @Column({ type: 'int', default: 1 })
  version_number: number;

  // When the published data last changed: a publish, a Version published into this Dataset, or a
  // Raster Load that removed layers from it. Metadata edits move only updated_at, whose type it shares.
  @Column({ type: 'timestamp', nullable: true })
  data_updated_at?: Date | null;

  // Not a column, populated at runtime for a Privileged caller: the open Version of this Dataset
  pending_version?: PendingVersion | null;

  // Not a column, populated at runtime based on entitlements
  capabilities?: Capability[];

  // Not a column, populated at runtime from processing_steps.description
  preprocessing_steps?: string | null;

  // Not a column, populated at runtime from pg-boss for a Privileged caller (docs/adr/0042)
  queued_job?: QueuedJob | null;
  // Likewise: the load running on the Dataset, which no longer changes its status
  active_job?: QueuedJob | null;

  // Not a column, populated at runtime from the raster Files or spatial_extent (DatasetService.decorateWithBbox)
  bbox?: Envelope | null;
}
