import { Entity, Column, Unique, PrimaryColumn, ManyToOne, JoinColumn, Index, BaseEntity } from 'typeorm';
import DatasetLayerEntity from './DatasetLayer';
import ProcedureEntity from './Procedure';
import { Observation } from '../interfaces/Observation';

@Entity('observations')
@Unique(['dataset_layer_id', 'value', 'procedure_id'])
export default class ObservationEntity extends BaseEntity implements Observation {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Index()
  @Column({ type: 'text' })
  dataset_layer_id: string;

  @ManyToOne(() => DatasetLayerEntity, dataset_layer => dataset_layer.id, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dataset_layer_id' })
  dataset_layer: DatasetLayerEntity;

  @Column({ type: 'numeric' })
  value: number;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  procedure_id?: string;

  @ManyToOne(() => ProcedureEntity, procedure => procedure.id)
  @JoinColumn({ name: 'procedure_id' })
  procedure: ProcedureEntity;
}
