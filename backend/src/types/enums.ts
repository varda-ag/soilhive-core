export enum TokenScopes {
  SUPER_ADMIN = 'super-admin',
  DATA_ADMIN = 'data-admin',
  INTERNAL_REQUEST = 'internal-request',
}

export const TOKEN_ISSUER = 'soilhive-core';

export enum AuthModes {
  NONE = 'none',
  PASSWORD = 'password',
  OIDC = 'oidc',
}

export enum StorageModes {
  LOCAL = 'local',
  S3 = 's3',
  AZURE = 'azure',
  GCP = 'gcp',
}

export enum OverlapType {
  NONE = 'none',
  PARTIAL = 'partial',
  FULL = 'full',
}

export enum JobQueues {
  // Not using const to be able to iterate over values
  BULK_LOAD = 'bulk-load',
  RASTER_LOAD = 'raster-load',
  EXPORT = 'export',
  FILE_TO_DB = 'file-to-db',
  BULK_DELETE = 'bulk-delete',
  CLEANUP_ORPHAN_FILES = 'cleanup-orphan-files',
  REFRESH_DAI_STATS = 'refresh-dai-stats',
  // Named for the Data Request it produces, not for any one product
  DATA_REQUESTS = 'data-requests',
  // Soil Indexes are a second family of product over the same Aggregation Units, on their own queue
  // because one Run of them costs far more than a Data Request
  SOIL_INDEXES = 'soil-indexes',
}

/**
 * Which analytical product a data-requests run computes over its Aggregation Units.
 */
export enum StatisticsType {
  DESCRIPTIVE = 'descriptive',
  CLASS_DISTRIBUTION = 'class-distribution',
}

/**
 * What a Class Distribution is computed for.
 */
export enum VariableType {
  SOIL_PROPERTY = 'soil-property',
  SOIL_INDEX = 'soil-index',
}

/**
 * How a Class Distribution aggregates depths: `none` pools every depth into one bucket, `standard`
 * sorts each Observation into the Standard Depth Range holding its Layer's midpoint.
 */
export enum DepthRanges {
  NONE = 'none',
  STANDARD = 'standard',
}

/**
 * The outcome of a Data Request, as `/data-requests` reports it.
 * `pending` and `running` exist only while the job does; the table stores the terminal two.
 * There is no `cancelled`: cancelling destroys the Data Request, so a cancelled Run reads as
 * 404 rather than as a state (docs/adr/0037).
 */
export enum DataRequestStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Which Soil Index a `soil-indexes` Run computes over its Aggregation Units.
 */
export enum SoilIndexType {
  CREA_INDEX = 'crea-index',
}

export enum Capability {
  PREVIEW = 'preview',
  DOWNLOAD = 'download',
  OBFUSCATE_AS_POINTS = 'obfuscate_as_points',
  OBFUSCATE_AS_POLYGONS = 'obfuscate_as_polygons',
  READ = 'read',
  WRITE = 'write',
}
