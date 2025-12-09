import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import AnalyticalMethodEntity from "./AnalyticalMethod";
import { AnalyticalMethodSlugHistory } from "../interfaces/AnalyticalMethodSlugHistory";
import BaseTable from "./BaseTable";

@Entity("analytical_method_slug_history")
export default class AnalyticalMethodSlugHistoryEntity extends BaseTable implements AnalyticalMethodSlugHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid" })
  analytical_method_id: string;

  @ManyToOne(() => AnalyticalMethodEntity, (analytical_method) => analytical_method.id)
  @JoinColumn({ name: "analytical_method_id" })
  analytical_method: AnalyticalMethodEntity;

  @Column({ type: "text" })
  old_slug: string;
}
