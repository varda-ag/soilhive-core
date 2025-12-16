import { Entity, Column, PrimaryColumn, Unique, ForeignKey } from 'typeorm';
import { File } from '../interfaces/File';
import BaseTable from './BaseTable';
import SlugHistoryEntity from './SlugHistory';
import { IngestionStatus } from '../types/data';

@Entity('files')
@Unique(['name'])
@Unique(['slug'])
@ForeignKey(() => SlugHistoryEntity, ['id', 'slug'], ['entity_id', 'slug'], {
  deferrable: 'INITIALLY DEFERRED',
})
export default class FileEntity extends BaseTable implements File {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  file_path: string;

  @Column({ type: 'text', default: IngestionStatus.PENDING })
  status: IngestionStatus;

  @Column({ type: 'text' })
  created_by: string;

  @Column({ type: 'text', nullable: true })
  updated_by?: string;
}
