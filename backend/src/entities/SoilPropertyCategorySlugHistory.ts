import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import SoilPropertyCategoryEntity from "./SoilPropertyCategory";
import { SoilPropertyCategorySlugHistory } from "../interfaces/SoilPropertyCategorySlugHistory";
import BaseTable from "./BaseTable";

@Entity("soil_property_category_slug_history")
export default class SoilPropertyCategorySlugHistoryEntity extends BaseTable implements SoilPropertyCategorySlugHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid" })
  property_category_id: string;

  @ManyToOne(() => SoilPropertyCategoryEntity, (soil_property_category) => soil_property_category.id)
  @JoinColumn({ name: "property_category_id" })
  soil_property_category: SoilPropertyCategoryEntity;

  @Column({ type: "text" })
  old_slug: string;
}
