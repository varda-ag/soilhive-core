import { Entity, Column, PrimaryColumn, ForeignKey } from 'typeorm';
import { Procedure } from '../interfaces/Procedure';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import { ProcedureTechnique } from '../types/data';

@Entity('procedures')
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class ProcedureEntity extends BaseTable implements Procedure {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text', nullable: true })
  sample_pretreatment?: string;

  @Column({
    type: 'enum',
    enum: ProcedureTechnique,
  })
  technique?: ProcedureTechnique;

  @Column({ type: 'text', nullable: true })
  extractant_formulation?: string;

  @Column({ type: 'text', nullable: true })
  extractant_concentration?: string;

  @Column({ type: 'text', nullable: true })
  extraction_ratio?: string;

  @Column({ type: 'text', nullable: true })
  extraction_base?: string;

  @Column({ type: 'text', nullable: true })
  instrument?: string;

  @Column({ type: 'text', nullable: true })
  limit_of_detection?: string;

}
