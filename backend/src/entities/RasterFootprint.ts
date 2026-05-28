import { Entity, Column, Index, PrimaryColumn } from 'typeorm';
import type { MultiPolygon } from 'geojson';

@Entity('raster_footprints')
export default class RasterFootprintEntity {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text', insert: false, update: false })
  geom_hash: string;

  @Index({ spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: MultiPolygon;
}
