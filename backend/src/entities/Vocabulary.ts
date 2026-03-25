import { Entity, Column, Unique, Index, PrimaryColumn } from 'typeorm';
import { Vocabulary } from '../interfaces/Vocabulary';
import BaseTable from './BaseTable';
import { VocabularyType } from '../types/data';

@Entity('vocabulary')
@Index(['category', 'id'])
@Unique(['id', 'category'])
export default class VocabularyEntity extends BaseTable implements Vocabulary {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ primary: true, type: 'text' })
  slug: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
  })
  category: VocabularyType;

  @Column({ type: 'text' })
  name: string;
}
