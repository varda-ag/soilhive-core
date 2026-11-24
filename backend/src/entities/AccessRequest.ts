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

  // What the requester said about themselves, unchecked. Null on requests made before these were asked for.
  @Column({ type: 'text', nullable: true })
  requester_name: string | null;

  /** ISO 3166-1 alpha-2 code of the country the requester lives or works in. */
  @Column({ type: 'text', nullable: true })
  country: string | null;

  @Column({ type: 'text', nullable: true })
  organisation: string | null;

  /** Always with its `http(s)://`. */
  @Column({ type: 'text', nullable: true })
  organisation_website: string | null;
}
