import { Entity, Column, PrimaryColumn, ForeignKey, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { Procedure } from '../interfaces/Procedure';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import { ProcedureTechnique, VocabularyType } from '../types/data';
import VocabularyEntity from './Vocabulary';

@Entity('procedures')
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
@Unique(['sample_pretreatment_id', 'technique', 'laboratory_method_id', 'extractant_concentration_id', 'extraction_ratio_id', 'extraction_base_id', 'measurement_procedure_id', 'limit_of_detection_id']) // NULLS NOT DISTINCT defined in migration
export default class ProcedureEntity extends BaseTable implements Procedure {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'uuid', nullable: true })
  sample_pretreatment_id?: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'sample_pretreatment'::vocabulary_category_enum`,
  })
  sample_pretreatment_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'sample_pretreatment_id', referencedColumnName: 'id' },
    { name: 'sample_pretreatment_category', referencedColumnName: 'category' },
  ])
  sample_pretreatment: VocabularyEntity;

  @Column({
    type: 'enum',
    enum: ProcedureTechnique,
    nullable: true,
  })
  technique?: ProcedureTechnique;

  @Column({ type: 'uuid', nullable: true })
  laboratory_method_id?: string;
  
  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'laboratory_method'::vocabulary_category_enum`,
  })
  laboratory_method_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'laboratory_method_id', referencedColumnName: 'id' },
    { name: 'laboratory_method_category', referencedColumnName: 'category' },
  ])
  laboratory_method: VocabularyEntity;


  @Column({ type: 'uuid', nullable: true })
  extractant_concentration_id?: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'extractant_concentration'::vocabulary_category_enum`,
  })
  extractant_concentration_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'extractant_concentration_id', referencedColumnName: 'id' },
    { name: 'extractant_concentration_category', referencedColumnName: 'category' },
  ])
  extractant_concentration: VocabularyEntity;

  @Column({ type: 'uuid', nullable: true })
  extraction_ratio_id?: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'extraction_ratio'::vocabulary_category_enum`,
  })
  extraction_ratio_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'extraction_ratio_id', referencedColumnName: 'id' },
    { name: 'extraction_ratio_category', referencedColumnName: 'category' },
  ])
  extraction_ratio: VocabularyEntity;

  @Column({ type: 'uuid', nullable: true })
  extraction_base_id?: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'extraction_base'::vocabulary_category_enum`,
  })
  extraction_base_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'extraction_base_id', referencedColumnName: 'id' },
    { name: 'extraction_base_category', referencedColumnName: 'category' },
  ])
  extraction_base: VocabularyEntity;

  @Column({ type: 'uuid', nullable: true })
  measurement_procedure_id?: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'measurement_procedure'::vocabulary_category_enum`,
  })
  measurement_procedure_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'measurement_procedure_id', referencedColumnName: 'id' },
    { name: 'measurement_procedure_category', referencedColumnName: 'category' },
  ])
  measurement_procedure: VocabularyEntity;

  @Column({ type: 'uuid', nullable: true })
  limit_of_detection_id?: string;

  @Column({
    type: 'enum',
    enum: VocabularyType,
    enumName: 'vocabulary_category_enum',
    generatedType: 'STORED',
    asExpression: `'limit_of_detection'::vocabulary_category_enum`,
  })
  limit_of_detection_category: VocabularyType;

  @ManyToOne(() => VocabularyEntity, { nullable: true })
  @JoinColumn([
    { name: 'limit_of_detection_id', referencedColumnName: 'id' },
    { name: 'limit_of_detection_category', referencedColumnName: 'category' },
  ])
  limit_of_detection: VocabularyEntity;
}
