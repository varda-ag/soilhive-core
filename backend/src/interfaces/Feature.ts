import type { Point, Polygon } from 'typeorm';

export interface Feature {
  id: string;
  geom: Point | Polygon;
  geom_hash: string;
}
