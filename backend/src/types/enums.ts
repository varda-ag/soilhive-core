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
  EXPORT = 'export',
  FILE_TO_DB = 'file-to-db',
  BULK_DELETE = 'bulk-delete',
  CLEANUP_ORPHAN_FILES = 'cleanup-orphan-files',
}

export enum Capability {
  PREVIEW = 'preview',
  DOWNLOAD = 'download',
  OBFUSCATE_AS_POINTS = 'obfuscate_as_points',
  OBFUSCATE_AS_POLYGONS = 'obfuscate_as_polygons',
}
