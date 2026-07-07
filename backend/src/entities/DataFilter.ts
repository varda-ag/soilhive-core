import { Entity, Column, PrimaryColumn } from 'typeorm';
import BaseTable from './BaseTable';
import { type DataFilterDTO, StoredDataFilter } from '../interfaces/DatasetFilter';

@Entity('data_filters')
export default class DataFilterEntity extends BaseTable implements StoredDataFilter {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'jsonb' })
  filter: DataFilterDTO;

  // Canonical content identity (see FilterService.computeFilterHash / ADR 0007).
  // Excluded from API responses via select: false.
  @Column({ type: 'text', nullable: true, select: false })
  filter_hash?: string;

  @Column({ type: 'boolean', default: false })
  persistent: boolean;

  @Column({ type: 'text', default: null, nullable: true })
  name?: string;

  @Column({ type: 'text', default: null, nullable: true })
  owner?: string;
}
