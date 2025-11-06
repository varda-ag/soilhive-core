import { Entity, Column, PrimaryColumn } from "typeorm";
import BaseTable from "./BaseTable";

@Entity("jsonstorage")
export class JsonStorage extends BaseTable {
  @PrimaryColumn()
  id: string;

  @Column("jsonb", { nullable: false })
  data: string;
}
