import { Entity, Column, Unique, PrimaryColumn, ManyToOne, JoinColumn, ForeignKey } from 'typeorm';
import { UnitConversion } from '../interfaces/UnitConversion';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import SoilPropertyEntity from './SoilProperty';

@Entity('unit_conversions')
@Unique(['slug'])
@Unique(['property_id', 'original_unit_of_measurement'])
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class UnitConversionEntity extends BaseTable implements UnitConversion {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'uuid' })
  property_id: string;

  @ManyToOne(() => SoilPropertyEntity, soil_property => soil_property.original_units_of_measurement, {
    deferrable: 'INITIALLY DEFERRED',
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'property_id' })
  soil_property: SoilPropertyEntity;

  @Column({ type: 'text', nullable: true })
  original_unit_of_measurement?: string;

  @Column({ type: 'text', nullable: true })
  conversion_formula?: string;
}
