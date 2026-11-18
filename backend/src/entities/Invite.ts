import { Column, Entity, PrimaryColumn } from 'typeorm';
import BaseTable from './BaseTable';
import type { Entitlements } from '../types/Entitlements';

/**
 * Entitlements held back until someone redeems them (docs/adr/0082). `deleted_at` marks a withdrawn
 * Invite. Grants are keyed like `entitlements.data`, so redeeming merges them as they are.
 */
@Entity('invites')
export default class InviteEntity extends BaseTable {
  @PrimaryColumn('uuid', { default: () => 'uuidv7()' })
  id: string;

  /** sha256 of the token in the link; the token itself is never stored. */
  @Column({ type: 'text', unique: true })
  token_hash: string;

  @Column('jsonb')
  grants: Entitlements;

  /** Only the person with this email may redeem it (docs/adr/0081). */
  @Column({ type: 'text', nullable: true })
  recipient: string | null;

  /** Redeemable by many until it expires; never with a recipient. */
  @Column({ type: 'boolean', default: false })
  reusable: boolean;

  @Column('timestamptz')
  expires_at: Date;

  /** When a single-use Invite was redeemed. A reusable one is never used up. */
  @Column({ type: 'timestamptz', nullable: true })
  used_at: Date | null;

  @Column({ type: 'text' })
  created_by: string;

  /** A Privileged creator's config grants are not checked again at redemption: their rights came from the token. */
  @Column({ type: 'boolean' })
  created_by_privileged: boolean;
}
