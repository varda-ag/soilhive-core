import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * A distinct set of raster layers that reference the same footprints (ADR-0046). Written only by
 * the refresh_raster_layer_groups triggers on raster_layer_footprints — never by application code.
 */
@Entity('raster_layer_groups')
export default class RasterLayerGroupEntity {
  @PrimaryColumn('uuid', {
    default: () => 'uuidv7()',
  })
  id: string;

  /** md5 of the group's sorted layer ids. */
  @Column({ type: 'text', unique: true })
  layer_ids_hash: string;
}
