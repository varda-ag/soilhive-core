import { Entity, Column, PrimaryColumn, Unique, ForeignKey } from 'typeorm';
import { SoilPropertyCategory } from '../interfaces/SoilPropertyCategory';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';

@Entity('soil_property_categories')
@Unique(['category_name'])
@Unique(['slug'])
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class SoilPropertyCategoryEntity extends BaseTable implements SoilPropertyCategory {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  category_name: string;

  @Column({ type: 'text' })
  category_acronym: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
