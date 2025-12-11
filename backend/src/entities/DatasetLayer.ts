import { Entity, Column, Unique, PrimaryColumn, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import DatasetEntity from './Dataset';
import FeatureEntity from './Feature';
import LayerEntity from './Layer';
import SoilPropertyEntity from './SoilProperty';

@Entity('dataset_layers')
@Unique(['dataset_id', 'feature_id', 'layer_id', 'soil_property_id'])
export default class DatasetLayerEntity extends BaseEntity {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  @Column({ type: 'uuid' })
  dataset_id: string;

  @ManyToOne(() => DatasetEntity, dataset => dataset.id)
  @JoinColumn({ name: 'dataset_id' })
  dataset: DatasetEntity;

  @Column({ type: 'uuid' })
  layer_id: string;

  @ManyToOne(() => LayerEntity, layer => layer.id)
  @JoinColumn({ name: 'layer_id' })
  layer: LayerEntity;

  @Column({ type: 'uuid' })
  feature_id: string;

  @ManyToOne(() => FeatureEntity, feature => feature.id)
  @JoinColumn({ name: 'feature_id' })
  feature: FeatureEntity;

  @Column({ type: 'uuid' })
  soil_property_id: string;

  @ManyToOne(() => SoilPropertyEntity, soil_property => soil_property.id)
  @JoinColumn({ name: 'soil_property_id' })
  soil_property: SoilPropertyEntity;
}
