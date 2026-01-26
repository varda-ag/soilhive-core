import { PropertyMapping } from '../interfaces/PropertyMapping';

export type DataMappingObject = {
  [key: string]: PropertyMapping | string; // dynamic entries for property columns (PropertyMapping values) and metadata columns (string values)
} & {
  drop_records?: number[]; // fixed entries
};
