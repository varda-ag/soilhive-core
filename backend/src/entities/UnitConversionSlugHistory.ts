import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import UnitConversionEntity from "./UnitConversion";
import { UnitConversionSlugHistory } from "../interfaces/UnitConversionSlugHistory";
import BaseTable from "./BaseTable";

@Entity("unit_conversion_slug_history")
export default class UnitConversionSlugHistoryEntity extends BaseTable implements UnitConversionSlugHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid" })
  unit_conversion_id: string;

  @ManyToOne(() => UnitConversionEntity, (unit_conversion) => unit_conversion.id)
  @JoinColumn({ name: "unit_conversion_id" })
  unit_conversion: UnitConversionEntity;

  @Column({ type: "text" })
  old_slug: string;
}
