import { Entity, Column, PrimaryColumn, Unique } from "typeorm";
import { License } from "../interfaces/License";
import BaseTable from "./BaseTable";

@Entity("licenses")
@Unique(["slug"])
@Unique(["name"])
export default class LicenseEntity extends BaseTable implements License {
  @PrimaryColumn("uuid", {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: "text" })
  name: string;

  @Column({ type: "text" })
  slug: string;

  @Column({ type: "text", nullable: true })
  full_name?: string;

  @Column({ type: "text", nullable: true })
  url?: string;
}
