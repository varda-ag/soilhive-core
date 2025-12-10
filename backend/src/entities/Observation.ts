import { Entity, Column, Unique, PrimaryColumn, ManyToOne, JoinColumn, Index, BaseEntity } from "typeorm";
import DatasetLayerEntity from "./DatasetLayer";
import AnalyticalMethodEntity from "./AnalyticalMethod";
import { Observation } from "../interfaces/Observation";

@Entity("observations")
@Unique(["dataset_layer_id", "value", "analytical_methodology_id"])
export default class ObservationEntity extends BaseEntity implements Observation {
  @PrimaryColumn("uuid", {
    default: () => 'uuidv7()',
  })
  id: string;
  
  @Index()
  @Column({ type: "text" })
  dataset_layer_id: string;

  @ManyToOne(() => DatasetLayerEntity, (dataset_layer) => dataset_layer.id)
  @JoinColumn({ name: "dataset_layer_id" })
  dataset_layer: DatasetLayerEntity;

  @Column({ type: "numeric" })
  value: number;

  @Index()
  @Column({ type: "uuid", nullable: true })
  analytical_methodology_id?: string;

  @ManyToOne(() => AnalyticalMethodEntity, (analytical_method) => analytical_method.id)
  @JoinColumn({ name: "analytical_methodology_id" })
  analytical_method: AnalyticalMethodEntity;
}