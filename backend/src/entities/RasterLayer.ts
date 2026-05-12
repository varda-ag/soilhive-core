import { Entity, Column, PrimaryColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { RasterLayer } from '../interfaces/RasterLayer';
import BaseTable from './BaseTable';
import DatasetEntity from './Dataset';
import { Polygon, MultiPolygon } from 'geojson';
import { Extent } from '../types/data';
import SoilPropertyEntity from './SoilProperty';
import FileEntity from './File';

@Entity('raster_layers')
export default class RasterLayerEntity extends BaseTable implements RasterLayer {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'uuid' })
  file_id: string;

  @ManyToOne(() => FileEntity, file => file.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'file_id' })
  file: FileEntity;

  @Column({ type: 'int' })
  resolution_m: number;

  @Column({ type: 'int', nullable: true })
  min_depth: number | null;

  @Column({ type: 'int', nullable: true })
  max_depth: number | null;

  @Column({ type: 'text', nullable: true })
  reference_period_start: string | null;

  @Column({ type: 'text', nullable: true })
  reference_period_stop: string | null;

  @Column({ type: 'uuid' })
  dataset_id: string;

  @ManyToOne(() => DatasetEntity, dataset => dataset.id)
  @JoinColumn({ name: 'dataset_id' })
  dataset: DatasetEntity;

  @Column({ type: 'uuid' })
  soil_property_id: string;

  @ManyToOne(() => SoilPropertyEntity, soil_property => soil_property.id)
  @JoinColumn({ name: 'soil_property_id' })
  soil_property: SoilPropertyEntity;

  @Column({
    type: 'enum',
    enum: Extent,
    enumName: 'raster_layers_extent_enum',
  })
  extent_type: Extent;

  @Column({
    type: 'geometry',
    srid: 4326,
    spatialFeatureType: 'Polygon',
    generatedType: 'STORED',
    asExpression: 'ST_Envelope(footprint)',
    nullable: true,
  })
  @Index({ spatial: true })
  bbox: Polygon | null;

  @Column({
    type: 'geometry',
    srid: 4326,
    spatialFeatureType: 'MultiPolygon',
    nullable: true,
  })
  @Index({ spatial: true })
  footprint: MultiPolygon | null;

  @Column({ type: 'jsonb', nullable: true })
  description: object | null;

  @Column({ type: 'text', array: true, nullable: true })
  geohash_cells: string[] | null;

  @Column({ type: 'int', nullable: true })
  nodata_value: number | null;
}
