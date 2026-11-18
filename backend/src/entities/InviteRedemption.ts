import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import InviteEntity from './Invite';

/** Who redeemed an Invite, kept so its creator can see whom to remove later (docs/adr/0082). */
@Entity('invite_redemptions')
export default class InviteRedemptionEntity {
  @PrimaryColumn('uuid')
  invite_id: string;

  @PrimaryColumn('text')
  subject: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  redeemed_at: Date;

  @ManyToOne(() => InviteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invite_id' })
  invite: InviteEntity;
}
