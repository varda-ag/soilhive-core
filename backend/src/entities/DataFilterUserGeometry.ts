import { Entity, PrimaryColumn, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import DataFilterEntity from './DataFilter';
import UserGeometryEntity from './UserGeometry';

@Entity('data_filter_user_geometries')
export default class DataFilterUserGeometryEntity extends BaseEntity {
  @PrimaryColumn('uuid')
  data_filter_id: string;

  @PrimaryColumn('uuid')
  user_geometry_id: string;

  @ManyToOne(() => DataFilterEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'data_filter_id' })
  data_filter: DataFilterEntity;

  @ManyToOne(() => UserGeometryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_geometry_id' })
  user_geometry: UserGeometryEntity;
}
