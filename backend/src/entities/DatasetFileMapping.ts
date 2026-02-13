import { Entity, Column, Unique, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import BaseTable from './BaseTable';
import FileEntity from './File';
import DatasetEntity from './Dataset';
import DataMappingEntity from './DataMapping';

@Entity('dataset_file_mappings')
@Unique(['data_mapping_id', 'file_id', 'dataset_id'])
export default class DatasetFileMappingEntity extends BaseTable {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'uuid', nullable: true })
  data_mapping_id: string;

  @ManyToOne(() => DataMappingEntity, data_mapping => data_mapping.id)
  @JoinColumn({ name: 'data_mapping_id' })
  data_mapping: DataMappingEntity;

  @Column({ type: 'uuid', nullable: true })
  file_id?: string;

  @ManyToOne(() => FileEntity, file => file.id)
  @JoinColumn({ name: 'file_id' })
  file: FileEntity;

  @Column({ type: 'uuid' })
  dataset_id?: string;

  @ManyToOne(() => DatasetEntity, dataset => dataset.id)
  @JoinColumn({ name: 'dataset_id' })
  dataset: DatasetEntity;
}
