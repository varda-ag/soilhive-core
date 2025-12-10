import { Entity, Column, PrimaryColumn } from "typeorm";
import { DataMapping } from "../interfaces/DataMapping";
import BaseTable from "./BaseTable";

@Entity("data_mappings")
export default class DataMappingEntity extends BaseTable implements DataMapping {
  @PrimaryColumn("uuid", {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: "jsonb" })
  data_mapping: object;

  @Column({ type: "text" })
  created_by: string;
}