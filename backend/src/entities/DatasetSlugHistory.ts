import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import DatasetEntity from "./Dataset";
import { DatasetSlugHistory } from "../interfaces/DatasetSlugHistory";
import BaseTable from "./BaseTable";

@Entity("dataset_slug_history")
export default class DatasetSlugHistoryEntity extends BaseTable implements DatasetSlugHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "uuid" })
  dataset_id: string;

  @ManyToOne(() => DatasetEntity, (dataset) => dataset.id)
  @JoinColumn({ name: "dataset_id" })
  dataset: DatasetEntity;

  @Column({ type: "text" })
  old_slug: string;
}
