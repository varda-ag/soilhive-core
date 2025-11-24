import { StorageModes, StorageModesType } from "../types/types";

export interface LocalStorageConfig {
  rootFolder: string;
}

export interface S3StorageConfig {
  role: string;
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

export const defaultStorageConfig: StorageConfig = {
  storageMode: StorageModes.LOCAL,
  config: {
    rootFolder: "/tmp/soilhive-storage",
  },
};