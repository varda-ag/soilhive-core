import { Entity, Column, PrimaryColumn, Unique, ForeignKey } from "typeorm";
import { License } from "../interfaces/License";
import BaseTable from "./BaseTable";
import SlugHistoryEntity from "./SlugHistory";

@Entity("licenses")
@Unique(["slug"])
@Unique(["name"])
@ForeignKey(() => SlugHistoryEntity, ["id", "slug"], ["entity_id", "slug"])
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
