import { Entity, Column, Index, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import type { MultiPolygon } from 'geojson';
import RasterLayerEntity from './RasterLayer';

@Entity('raster_footprints')
export default class RasterFootprintEntity {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'uuid' })
  raster_layer_id: string;

  @ManyToOne(() => RasterLayerEntity, rl => rl.footprints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raster_layer_id' })
  rasterLayer: RasterLayerEntity;

  @Column({ type: 'int' })
  tile_col: number;

  @Column({ type: 'int' })
  tile_row: number;

  @Index({ spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: MultiPolygon;
}
