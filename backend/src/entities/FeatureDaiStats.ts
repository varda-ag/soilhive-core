import { Entity, Column, PrimaryColumn, Index, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import type { Point } from 'typeorm';
import FeatureEntity from './Feature';

// Precomputed per-feature DAI aggregates, populated exclusively by
// refreshDaiStats (data-layer/DaiStats.ts); never written through the entity.
// See docs/adr/0009.
@Entity('feature_dai_stats')
export default class FeatureDaiStatsEntity extends BaseEntity {
  @PrimaryColumn('uuid')
  feature_id: string;

  @ManyToOne(() => FeatureEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature: FeatureEntity;

  @Column({
    type: 'geometry',
    srid: 4326,
  })
  @Index({ spatial: true })
  centroid: Point;

  @Column('integer')
  num_soil_properties: number;

  @Column('integer')
  num_props_below_30: number;

  @Column('integer')
  num_dated_layers: number;

  @Column('integer')
  num_distinct_years: number;
}
