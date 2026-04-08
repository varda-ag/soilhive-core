export const enum GISDataType {
  POINT = 'point',
  POLYGONAL = 'polygonal',
  RASTER = 'raster',
}

export const enum IngestionStatus {
  PENDING = 'PENDING',
  ONGOING = 'ONGOING',
  LOADED = 'LOADED',
  PUBLISHED = 'PUBLISHED',
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
  vocabulary = 'proecdures_vocabulary',
}

export enum VocabularyType {
  SAMPLE_PRETREATMENT = 'sample_pretreatment',
  LABORATORY_METHOD = 'laboratory_method',
  EXTRACTANT_CONCENTRATION = 'extractant_concentration',
  EXTRACTION_RATIO = 'extraction_ratio',
  EXTRACTION_BASE = 'extraction_base',
  MEASUREMENT_PROCEDURE = 'measurement_procedure',
  LIMIT_OF_DETECTION = 'limit_of_detection',
}

export enum ProcedureTechnique {
  LAB_PROCEDURE = 'lab procedure',
  SPECTRAL = 'spectral',
  CALCULATED = 'calculated',
}
