import { Column, Entity, PrimaryColumn } from 'typeorm';
import BaseTable from './BaseTable';
import { Capability } from '../types/enums';

/** A Subject's request for access to Datasets; each Dataset is decided on its own (docs/adr/0082). */
@Entity('access_requests')
export default class AccessRequestEntity extends BaseTable {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  /** The requester's Subject, which approving grants to. */
  @Column({ type: 'text' })
  requested_by: string;

  /** Asked for on every Dataset in the request. */
  @Column('jsonb')
  capabilities: Capability[];

  @Column({ type: 'text', nullable: true })
  message: string | null;
}
