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
  // Named for the Data Request it produces, not for any one product: the queue dispatches on
  // StatisticsType and only DESCRIPTIVE yields Soil Statistics. Deliberately not "soil-data-stats",
  // which already means the ingest Cleaning Report served by getSoilDataStats, nor "soil-statistics",
  // which named only one of the products (see the Flagged ambiguities in CONTEXT.md).
  DATA_REQUESTS = 'data-requests',
}

/**
 * Which analytical product a data-requests run computes over its Aggregation Units.
 *
 * Every type resolves the same Units from the same Filter and differs only in what it
 * computes for them, so a type is a choice of *product* — never of area, criteria or
 * entitlement. DESCRIPTIVE is the default and is the one that yields Soil Statistics in
 * the CONTEXT.md sense; every type's output is carried by a Data Request, so the queue name
 * covers them all rather than naming one product.
 */
export enum StatisticsType {
  DESCRIPTIVE = 'descriptive',
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
