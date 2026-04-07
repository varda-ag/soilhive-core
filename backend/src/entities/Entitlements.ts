import { Entity, Column, PrimaryColumn } from 'typeorm';
import BaseTable from './BaseTable';
import type { Entitlements } from '../types/Entitlements';
import { UserEntitlements } from '../interfaces/UserEntitlements';

@Entity('entitlements')
export class EntitlementsEntity extends BaseTable implements UserEntitlements {
  @PrimaryColumn()
  id: string;

  @Column('jsonb', { nullable: false })
  data: Entitlements;
}
