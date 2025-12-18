import { Entity, Column, PrimaryColumn, Unique, Index, BaseEntity } from 'typeorm';
import type { Point, Polygon } from 'typeorm';
import { Feature } from '../interfaces/Feature';

@Entity('features')
@Unique(['geom_hash'])
export default class FeatureEntity extends BaseEntity implements Feature {
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
  geom: Point | Polygon;

  @Column({ type: 'text',
    generatedType: "STORED",
    asExpression: `encode(sha256(geom::TEXT::BYTEA), 'hex')` })
  geom_hash: string;
}
