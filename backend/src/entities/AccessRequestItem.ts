import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import AccessRequestEntity from './AccessRequest';
import DatasetEntity from './Dataset';
import { Capability } from '../types/enums';
import type { AccessRequestItemStatus } from '../types/AccessRequests';

/**
 * One Dataset of an Access Request and its decision. `requested_by` repeats the request's so a
 * unique index can allow one pending request per Subject per Dataset.
 */
@Entity('access_request_items')
export default class AccessRequestItemEntity {
  @PrimaryColumn('uuid')
  request_id: string;

  @PrimaryColumn('uuid')
  dataset_id: string;

  @Column({ type: 'text' })
  requested_by: string;

  @Column({ type: 'text', default: 'pending' })
  status: AccessRequestItemStatus;

  /** What an approval granted: the request's capabilities or fewer. */
  @Column({ type: 'jsonb', nullable: true })
  granted: Capability[] | null;

  /** Why it was denied, shown to the requester. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  decided_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decided_at: Date | null;

  @ManyToOne(() => AccessRequestEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: AccessRequestEntity;

  @ManyToOne(() => DatasetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dataset_id' })
  dataset: DatasetEntity;
}
