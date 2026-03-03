import { Entity, Column, PrimaryColumn } from 'typeorm';
import { RasterFilter } from '../interfaces/RasterFilter';
import BaseTable from './BaseTable';

@Entity('raster_filters')
export default class RasterFilterEntity extends BaseTable implements RasterFilter {
  @PrimaryColumn('text')
  id: string; // This is the name of the table containing actual raster data

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  mappings: Record<string, number> | null;
}
