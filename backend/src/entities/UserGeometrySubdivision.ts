import { Entity, Column, PrimaryColumn, Index, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import type { Polygon } from 'geojson';
import UserGeometryEntity from './UserGeometry';

// Populated exclusively by the subdivide_user_geometry DB trigger; never written
// from application code. See docs/adr/0006-precomputed-geometry-subdivision-table.md
@Entity('user_geometry_subdivisions')
export default class UserGeometrySubdivisionEntity extends BaseEntity {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column('uuid')
  @Index()
  user_geometry_id: string;

  @ManyToOne(() => UserGeometryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_geometry_id' })
  user_geometry: UserGeometryEntity;

  @Column({
    type: 'geometry',
    srid: 4326,
  })
  @Index({ spatial: true })
  geom: Polygon;
}
