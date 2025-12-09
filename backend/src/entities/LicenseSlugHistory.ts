import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import LicenseEntity from "./License";
import { LicenseSlugHistory } from "../interfaces/LicenseSlugHistory";
import BaseTable from "./BaseTable";

@Entity("license_slug_history")
export default class LicensetSlugHistoryEntity extends BaseTable implements LicenseSlugHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid" })
  license: string;

  @ManyToOne(() => LicenseEntity, (license) => license.id, {
    deferrable: 'INITIALLY DEFERRED'})
  @JoinColumn({ name: "license" })
  license_obj: LicenseEntity;

  @Column({ type: "text" })
  old_slug: string;
}
