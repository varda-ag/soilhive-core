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

  // The Subject, often an email. Left out of API responses via select: false, as anyone with a
  // Filter's id can read it (docs/adr/0085).
  @Column({ type: 'text', default: null, nullable: true, select: false })
  owner?: string;
}
