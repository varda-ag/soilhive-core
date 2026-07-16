import { Entity, Column, Index, PrimaryColumn, ManyToOne, ManyToMany, JoinColumn, JoinTable } from 'typeorm';
import type { Polygon } from 'geojson';
import { RasterLayer } from '../interfaces/RasterLayer';
import BaseTable from './BaseTable';
import DatasetEntity from './Dataset';
import SoilPropertyEntity from './SoilProperty';
import FileEntity from './File';
import RasterFootprintEntity from './RasterFootprint';
import ProcedureEntity from './Procedure';

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

  @Column({ type: 'jsonb', nullable: true })
  description: object | null;

  @Column({ type: 'int', nullable: true })
  nodata_value: number | null;

  @Index({ spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  bbox: Polygon;

  @ManyToMany(() => RasterFootprintEntity)
  @JoinTable({
    name: 'raster_layer_footprints',
    joinColumn: { name: 'raster_layer_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'raster_footprint_id', referencedColumnName: 'id' },
  })
  footprints: RasterFootprintEntity[];

  @Column({ type: 'uuid', nullable: true })
  procedure_id?: string;

  @ManyToOne(() => ProcedureEntity, procedure => procedure.id)
  @JoinColumn({ name: 'procedure_id' })
  procedure: ProcedureEntity;
}
