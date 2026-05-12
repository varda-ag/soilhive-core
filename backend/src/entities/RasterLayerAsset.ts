import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { RasterLayerAsset } from '../interfaces/RasterLayer';
import BaseTable from './BaseTable';
import RasterLayerEntity from './RasterLayer';
import FileEntity from './File';

// Entity that stores auxiliary resources to raster layers (such as prediction layers, technical manual, etc.), provided on download
@Entity('raster_layer_assets')
export default class RasterLayerAssetEntity extends BaseTable implements RasterLayerAsset {
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

  @Column({ type: 'uuid' })
  raster_layer_id: string;

  @ManyToOne(() => RasterLayerEntity, raster_layer => raster_layer.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'raster_layer_id' })
  raster_layer: RasterLayerEntity;

  @Column({ type: 'jsonb', nullable: true })
  description: object | null;
}
