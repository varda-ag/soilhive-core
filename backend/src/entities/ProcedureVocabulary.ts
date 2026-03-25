import { Entity, Column, Unique, Index, PrimaryColumn } from 'typeorm';
import { ProcedureVocabulary } from '../interfaces/ProcedureVocabulary';
import BaseTable from './BaseTable';
import { ProcedureVocabularyType } from '../types/data';

@Entity('procedures_vocabulary')
@Index(['category', 'id'])
@Unique(['id', 'category'])
export default class ProcedureVocabularyEntity extends BaseTable implements ProcedureVocabulary {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
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
