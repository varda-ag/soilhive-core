import { Entity, Column, PrimaryColumn } from "typeorm";
import { AnalyticalMethod } from "../interfaces/AnalyticalMethod";
import BaseTable from "./BaseTable";

@Entity("analytical_methods")
export default class AnalyticalMethodEntity extends BaseTable implements AnalyticalMethod {
  @PrimaryColumn("uuid", {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: "text" })
  slug: string;

  @Column({ type: "text", nullable: true })
  analytical_method?: string;

  @Column({ type: "text", nullable: true })
  analytical_tool?: string;

  @Column({ type: "text", nullable: true })
  limit_of_detection?: string;

  @Column({ type: "text", nullable: true })
  reference_standard?: string;
}