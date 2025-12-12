export const GISDataType = {
  POINT: 'point',
  POLYGONAL: 'polygonal',
  RASTER: 'raster',
} as const;

export type GISDataTypeType = (typeof GISDataType)[keyof typeof GISDataType];

export const IngestionStatus = {
  PENDING: 'PENDING',
  ONGOING: 'ONGOING',
  INGESTED: 'INGESTED',
  RELEASED: 'RELEASED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type IngestionStatusType = (typeof IngestionStatus)[keyof typeof IngestionStatus];

export enum EntityType {
  DATASET = 'datasets', // named as table names
  LICENSE = 'licenses',
  SOIL_PROPERTY_CATEGORY = 'soil_property_categories',
  SOIL_PROPERTY = 'soil_properties',
  UNIT_CONVERSION = 'unit_conversions',
  ANALYTICAL_METHOD = 'analytical_methods',
  FILE = 'files',
}
