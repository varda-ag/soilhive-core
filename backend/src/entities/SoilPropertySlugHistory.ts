import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import SoilPropertyEntity from "./SoilProperty";
import { SoilPropertySlugHistory } from "../interfaces/SoilPropertySlugHistory";
import BaseTable from "./BaseTable";

@Entity("soil_property_slug_history")
export default class SoilPropertySlugHistoryEntity extends BaseTable implements SoilPropertySlugHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid" })
  property_id: string;

  @ManyToOne(() => SoilPropertyEntity, (soil_property) => soil_property.id)
  @JoinColumn({ name: "property_id" })
  soil_property: SoilPropertyEntity;

  @Column({ type: "text" })
  old_slug: string;
}