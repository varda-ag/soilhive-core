import { Entity, Column, Unique } from 'typeorm';
import { ProcedureVocabulary } from '../interfaces/ProcedureVocabulary';
import BaseTable from './BaseTable';
import { ProcedureVocabularyType } from '../types/data';

@Entity('procedure_vocabulary')
@Unique(['category', 'name'])
export default class ProcedureVocabularyEntity extends BaseTable implements ProcedureVocabulary {
  @Column({ primary: true, type: 'uuid' })
  id: string;

  @Column({ primary: true, type: 'text' })
  slug: string;

  @Column({
    type: 'enum',
    enum: ProcedureVocabularyType,
  })
  category: ProcedureVocabularyType;

  @Column({ type: 'text' })
  name: string;
}
