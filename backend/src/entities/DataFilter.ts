import { Entity, Column, PrimaryColumn } from 'typeorm';
import BaseTable from './BaseTable';

@Entity('data_filters')
export default class DataFilterEntity extends BaseTable {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'jsonb' })
  filter: object;

  @Column({ type: 'boolean', default: false })
  persistent: boolean;

  @Column({ type: 'text', default: null, nullable: true })
  name?: string;

  @Column({ type: 'text', default: null, nullable: true })
  owner?: string;
}
