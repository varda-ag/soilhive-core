import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { Point } from 'typeorm';
import BaseTable from './BaseTable';

// TODO: This is just a sample entity to test spatial features. Remove or replace it.

@Entity('locations')
export default class Location extends BaseTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('geometry', { spatialFeatureType: 'Point', srid: 4326 })
  coordinates: Point;
}
