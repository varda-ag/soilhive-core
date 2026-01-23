import { Entity, Column, PrimaryColumn } from 'typeorm';
import BaseTable from './BaseTable';
import { type DataFilter, StoredDataFilter } from '../interfaces/DatasetFilter';

@Entity('data_filters')
export default class DataFilterEntity extends BaseTable implements StoredDataFilter {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'jsonb' })
  filter: DataFilter;

  @Column({ type: 'boolean', default: false })
  persistent: boolean;

  @Column({ type: 'text', default: null, nullable: true })
  name?: string;

  @Column({ type: 'text', default: null, nullable: true })
  owner?: string;
}
