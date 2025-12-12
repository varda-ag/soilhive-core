import { Entity, Column, PrimaryColumn, ForeignKey } from 'typeorm';
import { AnalyticalMethod } from '../interfaces/AnalyticalMethod';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';

@Entity('analytical_methods')
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class AnalyticalMethodEntity extends BaseTable implements AnalyticalMethod {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text', nullable: true })
  analytical_method?: string;

  @Column({ type: 'text', nullable: true })
  analytical_tool?: string;

  @Column({ type: 'text', nullable: true })
  limit_of_detection?: string;

  @Column({ type: 'text', nullable: true })
  reference_standard?: string;
}
