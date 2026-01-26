import { Entity, Column, Unique, PrimaryColumn, ManyToOne, JoinColumn, Index, BaseEntity } from 'typeorm';
import { Layer } from '../interfaces/Layer';
import LicenseEntity from './License';

@Entity('layers')
@Unique(['license', 'sampling_date', 'min_depth', 'max_depth', 'horizon'])
export default class LayerEntity extends BaseEntity implements Layer {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'uuid', nullable: true })
  license?: string;

  @ManyToOne(() => LicenseEntity, license => license.id)
  @JoinColumn({ name: 'license' })
  license_obj: LicenseEntity;

  @Index()
  @Column({ type: 'date', nullable: true })
  sampling_date?: Date;

  @Column({ type: 'int', nullable: true })
  min_depth?: number;

  @Column({ type: 'int', nullable: true })
  max_depth?: number;

  @Column({ type: 'text', nullable: true })
  horizon?: string;
}
