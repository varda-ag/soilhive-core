import { Entity, Column, PrimaryColumn, Unique } from "typeorm";
import { File } from "../interfaces/File";
import BaseTable from "./BaseTable";
import type { IngestionStatusType } from "../types/data";
import { IngestionStatus } from "../types/data";

@Entity("files")
@Unique(["slug"])
export default class FileEntity extends BaseTable implements File {
  @PrimaryColumn("uuid", {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: "text" })
  slug: string;

  @Column({ type: "text" })
  file_path: string;

  @Column({ type: "text", default: IngestionStatus.PENDING })
  status: IngestionStatusType;

  @Column({ type: "boolean", default: false })
  is_archived: boolean;

  @Column({ type: "text" })
  created_by: string;

  @Column({ type: "text", nullable: true })
  updated_by?: string;
}
