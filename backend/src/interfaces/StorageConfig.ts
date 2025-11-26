import { StorageModesType } from "../types/types";

export interface LocalStorageConfig {
  rootFolder: string;
}

export interface S3StorageConfig {
  region: string;
  bucketName: string;
  rootFolder?: string;
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
  storageMode: StorageModesType;
  config: LocalStorageConfig | S3StorageConfig | AzureStorageConfig | GCPStorageConfig;
}
