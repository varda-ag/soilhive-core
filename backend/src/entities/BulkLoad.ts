import { Entity, Column, PrimaryColumn } from 'typeorm';
import { BulkLoad, BulkLoadStatus } from '../interfaces/BulkLoad';
import BaseTable from './BaseTable';

@Entity('bulk_load')
export default class BulkLoadEntity extends BaseTable implements BulkLoad {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  dataset_id: string;

  @Column({ type: 'text', default: BulkLoadStatus.ONGOING })
  status: BulkLoadStatus;

  @Column({ type: 'numeric', default: 0 })
  progress_percentage: number;

  @Column({ type: 'text', nullable: true })
  progress_description?: string;

  @Column({ type: 'text' })
  created_by: string;

  @Column({ type: 'text', nullable: true })
  updated_by?: string;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ name: 'failed_at', type: 'timestamp', nullable: true })
  failed_at: Date | null;
}
