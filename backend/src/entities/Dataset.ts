import { Entity, Column, PrimaryColumn, Unique, Index, ForeignKey } from 'typeorm';
import type { Polygon } from 'typeorm';
import { Dataset, VariableMeasured } from '../interfaces/Dataset';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import { GISDataType, IngestionStatus } from '../types/data';

@Entity('datasets')
@Unique(['name'])
@Unique(['slug'])
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class DatasetEntity extends BaseTable implements Dataset {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  full_name?: string;

  @Column({ type: 'text', nullable: true })
  version?: string;

  @Column({ type: 'text', nullable: true })
  author?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  data_producer?: string;

  @Column({ type: 'jsonb', nullable: true, array: true })
  variables_measured?: VariableMeasured[];

  @Column({ type: 'text', nullable: true })
  spatial_resolution?: string;

  @Column({ type: 'date', nullable: true })
  publication_date?: string;

  @Column({ type: 'text', nullable: true })
  reference_period_start?: Date;

  @Column({ type: 'text', nullable: true })
  reference_period_stop?: Date;

  @Column({ type: 'uuid', nullable: true, array: true })
  licenses?: string[];

  @Column({ type: 'text', nullable: true })
  citation?: string;

  @Column({ type: 'text', nullable: true })
  geographical_extent?: string;

  @Column({ type: 'text', nullable: true })
  gis_datatype?: GISDataType;

  @Column({
    type: 'geometry',
    srid: 4326,
    spatialFeatureType: 'Polygon',
    nullable: true,
  })
  @Index({ spatial: true })
  spatial_extent: Polygon;

  @Column({ type: 'bigint', nullable: true })
  n_observations?: string; // bigint stored as string to avoid JS number precision issues

  @Column({ type: 'int', nullable: true })
  n_raster_layers?: number;

  @Column({ type: 'jsonb', nullable: true })
  soil_depth?: object;

  @Column({ type: 'text', default: IngestionStatus.PENDING })
  status: IngestionStatus;

  @Column({ type: 'text' })
  created_by: string;

  @Column({ type: 'text', nullable: true })
  updated_by?: string;

  @Column({ type: 'text', nullable: true })
  service_location?: string;
}
