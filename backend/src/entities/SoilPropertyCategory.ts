import { Entity, Column, PrimaryColumn, Unique } from "typeorm";
import { SoilPropertyCategory } from "../interfaces/SoilPropertyCategory";
import BaseTable from "./BaseTable";

@Entity("soil_property_categories")
@Unique(["slug"])
export default class SoilPropertyCategoryEntity extends BaseTable implements SoilPropertyCategory {
  @PrimaryColumn("uuid", {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: "text" })
  slug: string;

  @Column({ type: "text" })
  category_name: string;

  @Column({ type: "text" })
  category_acronym: string;

  @Column({ type: "text", nullable: true })
  description?: string;
}