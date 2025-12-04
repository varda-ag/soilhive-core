import { Entity, Column, PrimaryGeneratedColumn, Unique } from "typeorm";
import type { Polygon } from "typeorm";
import { IDataset, VariableMeasured } from "../interfaces/Dataset";
import BaseTable from "./BaseTable";
import type { GISDataTypeType } from "../types/data";

@Entity("datasets")
@Unique(["slug"])
export default class Dataset extends BaseTable implements IDataset {
  @PrimaryGeneratedColumn("uuid")
  id: string; // Uses PostgreSQL UUID, with default uuid_generate_v7() in DB

  @Column({ type: "text" })
  slug: string;

  @Column({ type: "text" })
  name: string;

  @Column({ type: "text", nullable: true })
  full_name?: string;

  @Column({ type: "text", nullable: true })
  version?: string;

  @Column({ type: "text", nullable: true })
  author?: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "text", nullable: true })
  data_producer?: string;

  @Column({ type: "jsonb", nullable: true, array: true })
  variables_measured?: VariableMeasured[];

  @Column({ type: "text", nullable: true })
  spatial_resolution?: string;

  @Column({ type: "date", nullable: true })
  publication_date?: Date;

  @Column({ type: "text", nullable: true })
  reference_period_start?: string;

  @Column({ type: "text", nullable: true })
  reference_period_stop?: string;

  @Column({ type: "uuid", nullable: true, array: true })
  licenses?: string[];

  @Column({ type: "text", nullable: true })
  citation?: string;

  @Column({ type: "text", nullable: true })
  geographical_extent?: string;

  @Column({ type: "text", nullable: true })
  gis_datatype?: GISDataTypeType;

  @Column({
    type: "geometry",
    srid: 4326,
    spatialFeatureType: "Polygon",
  })
  spatial_extent: Polygon;

  @Column({ type: "bigint", nullable: true })
  n_observations?: string; // bigint stored as string to avoid JS number precision issues

  @Column({ type: "int", nullable: true })
  n_raster_layers?: number;

  @Column({ type: "jsonb", nullable: true })
  soil_depth?: object;

  @Column({ type: "text", default: "PENDING" })
  status: string;

  @Column({ type: "boolean", default: false })
  is_archived: boolean;

  @Column({ type: "text" })
  created_by: string;

  @Column({ type: "text", nullable: true })
  updated_by?: string;

  @Column({ type: "text", nullable: true })
  service_location?: string;
}
