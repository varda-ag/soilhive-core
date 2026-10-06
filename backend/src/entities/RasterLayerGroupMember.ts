import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import RasterLayerGroupEntity from './RasterLayerGroup';
import RasterLayerEntity from './RasterLayer';

/** A layer of a raster_layer_groups set (ADR-0046); written only by the refresh_raster_layer_groups triggers. */
@Entity('raster_layer_group_members')
export default class RasterLayerGroupMemberEntity {
  @PrimaryColumn('uuid')
  layer_group_id: string;

  @PrimaryColumn('uuid')
  raster_layer_id: string;

  @ManyToOne(() => RasterLayerGroupEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'layer_group_id' })
  layer_group: RasterLayerGroupEntity;

  @ManyToOne(() => RasterLayerEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raster_layer_id' })
  raster_layer: RasterLayerEntity;
}
