export const enum TokenScopes {
  SUPER_ADMIN = 'super-admin',
  DATA_ADMIN = 'data-admin',
}

export const enum AuthModes {
  NONE = 'none',
  PASSWORD = 'password',
  OIDC = 'oidc',
}

export const enum StorageModes {
  LOCAL = 'local',
  S3 = 's3',
  AZURE = 'azure',
  GCP = 'gcp',
}

export const enum OverlapType {
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
}
