import { Entity, Column, PrimaryColumn, Unique, ForeignKey } from 'typeorm';
import { UnitConversion } from '../interfaces/UnitConversion';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';

@Entity('unit_conversions')
@Unique(['slug'])
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

  @Column({ type: 'text', nullable: true })
  original_unit_of_measurement?: string;

  @Column({ type: 'text', nullable: true })
  standard_unit?: string;

  @Column({ type: 'text', nullable: true })
  conversion_formula?: string;
}
