import { StorageModes } from '../types/enums';

export interface LocalStorageConfig {
  rootFolder: string;
}

interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}
export interface S3StorageConfig {
  region: string;
  bucketName: string;
  rootFolder?: string;
  endpoint?: string;
  credentials?: S3Credentials;
}

export interface AzureStorageConfig {
  connectionString: string;
  containerName: string;
}

export interface GCPStorageConfig {
  projectId: string;
  bucketName: string;
}

export interface StorageConfig {
  storageMode: StorageModes;
  config: LocalStorageConfig | S3StorageConfig | AzureStorageConfig | GCPStorageConfig;
}
