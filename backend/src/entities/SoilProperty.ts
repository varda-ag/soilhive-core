import { Entity, Column, PrimaryColumn, Unique, ManyToOne, JoinColumn, Check, ForeignKey } from 'typeorm';
import { SoilProperty } from '../interfaces/SoilProperty';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import SoilPropertyCategoryEntity from './SoilPropertyCategory';
import { MAX_PROPERTY_LEVEL } from '../constants/constants';

@Entity('soil_properties')
@Unique(['property_name'])
@Unique(['slug'])
// TODO: Move this logic out of the DB
@Check(`(("property_level" >= 1) AND ("property_level" <= ${MAX_PROPERTY_LEVEL}))`)
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class SoilPropertyEntity extends BaseTable implements SoilProperty {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  property_name: string;

  @Column({ type: 'text' })
  property_acronym: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  standard_unit?: string;

  @Column({ type: 'int', nullable: true })
  property_level?: number;

  @Column({ type: 'text', nullable: true })
  parent_property_id?: string;

  @ManyToOne(() => SoilPropertyEntity, soil_property => soil_property.id, {
    deferrable: 'INITIALLY DEFERRED',
  })
  @JoinColumn({ name: 'parent_property_id' })
  parent_property: SoilPropertyEntity;

  @Column({ type: 'text' })
  category_id: string;

  @ManyToOne(() => SoilPropertyCategoryEntity, soil_property_category => soil_property_category.id, {
    deferrable: 'INITIALLY DEFERRED',
  })
  @JoinColumn({ name: 'category_id' })
  soil_property_category: SoilPropertyCategoryEntity;
}
