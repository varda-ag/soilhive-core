import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check } from 'typeorm';
import type { RasterFilter, RasterFilterKind } from '../interfaces/RasterFilter';
import BaseTable from './BaseTable';
import FileEntity from './File';

@Entity('raster_filters')
@Check('CHK_raster_filters_kind', `"kind" IN ('categorical', 'continuous')`)
export default class RasterFilterEntity extends BaseTable implements RasterFilter {
  @PrimaryColumn('text')
  id: string; // This is the name of the table containing actual raster data

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  mappings: Record<string, number> | null;

  @Column({ type: 'boolean', default: false })
  active: boolean;

  @Column({ type: 'text', default: 'categorical' })
  kind: RasterFilterKind;

  @Column({ type: 'uuid', nullable: true })
  file_id: string | null;

  @ManyToOne(() => FileEntity, file => file.id, {
    onDelete: 'NO ACTION',
    deferrable: 'INITIALLY DEFERRED',
  })
  @JoinColumn({ name: 'file_id' })
  file: FileEntity;

  @Column({ type: 'text', nullable: true })
  created_by: string | null;

  @Column({ type: 'int', nullable: true })
  resolution_m: number | null;

  @Column({ type: 'jsonb', nullable: true })
  pixel_values: Record<string, number> | null;
}
