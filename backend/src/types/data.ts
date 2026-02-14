export const enum GISDataType {
  POINT = 'point',
  POLYGONAL = 'polygonal',
  RASTER = 'raster',
}

export const enum IngestionStatus {
  PENDING = 'PENDING',
  ONGOING = 'ONGOING',
  INGESTED = 'INGESTED',
  RELEASED = 'RELEASED',
  ARCHIVED = 'ARCHIVED',
}

// Cannot be const enum because used in TypeORM decorators
export enum EntityType {
  DATASET = 'datasets', // named as table names
  LICENSE = 'licenses',
  SOIL_PROPERTY_CATEGORY = 'soil_property_categories',
  SOIL_PROPERTY = 'soil_properties',
  UNIT_CONVERSION = 'unit_conversions',
  PROCEDURE = 'procedures',
  FILE = 'files',
}

export enum ProcedureTechnique {
  LAB_PROCEDURE = 'lab procedure',
  SPECTRAL = 'spectral',
  CALCULATED = 'calculated',
}
