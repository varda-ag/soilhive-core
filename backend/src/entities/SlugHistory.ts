import { Entity, Column } from 'typeorm';
import { SlugHistory } from '../interfaces/SlugHistory';
import BaseTable from './BaseTable';
import { EntityType } from '../types/data';

@Entity('slug_history')
export default class SlugHistoryEntity extends BaseTable implements SlugHistory {
  @Column({ primary: true, type: 'uuid' })
  entity_id: string;

  @Column({
    type: 'enum',
    enum: EntityType,
  })
  entity_type: EntityType;

  @Column({ primary: true, type: 'text' })
  slug: string;
}
