import { PropertyMapping } from '../interfaces/PropertyMapping';

export type DataMappingObject = {
  [key: string]: PropertyMapping | string; // dynamic entries for property columns (PropertyMapping values) and metadata columns (string values)
} & {
  drop_records?: number[]; // fixed entries
};

export const enum DetectableFields {
  GEOMETRY = 'geometry',
  LICENSE = 'license',
  SAMPLING_DATE = 'sampling_date',
  DEPTH = 'depth',
  MIN_DEPTH = 'min_depth',
  MAX_DEPTH = 'max_depth',
  HORIZON = 'horizon',
  LATITUDE = 'latitude',
  LONGITUDE = 'longitude',
}
