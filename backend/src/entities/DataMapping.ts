import { Entity, Column, PrimaryColumn, Unique } from 'typeorm';
import { DataMapping } from '../interfaces/DataMapping';
import BaseTable from './BaseTable';

@Entity('data_mappings')
@Unique(['data_mapping_hash'])
export default class DataMappingEntity extends BaseTable implements DataMapping {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'jsonb' })
  data_mapping: object;

  @Column({ type: 'text',
    generatedType: "STORED",
    asExpression: `encode(sha256(data_mapping::TEXT::BYTEA), 'hex')` })
  data_mapping_hash: string;

  @Column({ type: 'text' })
  created_by: string;
}
