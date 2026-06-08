import { Entity, Column, PrimaryColumn, Unique, Index, BaseEntity } from 'typeorm';
import type { Polygon, MultiPolygon } from 'geojson';

@Entity('user_geometries')
@Unique(['geom_hash'])
export default class UserGeometryEntity extends BaseEntity {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({
    type: 'geometry',
    srid: 4326,
    nullable: true,
  })
  @Index({ spatial: true })
  geom: Polygon | MultiPolygon;

  @Column({ type: 'text', generatedType: 'STORED', asExpression: `encode(sha256(geom::TEXT::BYTEA), 'hex')` })
  geom_hash: string;
}
