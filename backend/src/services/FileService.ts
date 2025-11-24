import fs from "fs";
import { S3Client } from "@aws-sdk/client-s3";
import { FileStorage } from "@flystorage/file-storage";
import { AwsS3StorageAdapter } from "@flystorage/aws-s3";
import { LocalStorageAdapter } from "@flystorage/local-fs";
import { FlystorageMulterStorageEngine } from "@flystorage/multer-storage";
import { Repository } from "typeorm";
import { JsonStorage } from "../entities/JsonStorage";
import { LocalStorageConfig, S3StorageConfig, StorageConfig } from "../interfaces/StorageConfig";
import { ReservedConfigs, StorageModes } from "../types/types";
import ConfigService from "./ConfigService";

export default class FileService {
  fileDownload = (data: any): any => {
    return {
      todo: true,
    };
  };

  getStorageEngine = async (repo: Repository<JsonStorage>): Promise<FlystorageMulterStorageEngine> => {
    const configService = new ConfigService();
    const config: StorageConfig = await configService.getConfig(repo, ReservedConfigs.STORAGE);
    // Configure Flystorage
    const adapter = getAdapter(config);
    const fileStorage = new FileStorage(adapter);
    const storage = new FlystorageMulterStorageEngine(fileStorage, async (action, req, file) => {
      if (action === "handle") {
        // Use ID parameter to setup filename
        return req.params["fileId"]!;
      } else {
        // Return folder name/destination if needed
        return file.destination;
      }
    });
    return storage;
  };
}

// Creates adapter based on storage config (TODO: caching?)
const getAdapter = (config: StorageConfig): any => {
  let adapter: any;
  switch (config.storageMode) {
    case StorageModes.LOCAL:
      const localConfig = config.config as LocalStorageConfig;
      if (!fs.existsSync(localConfig.rootFolder)) {
        fs.mkdirSync(localConfig.rootFolder, { recursive: true });
      }
      adapter = new LocalStorageAdapter(localConfig.rootFolder);
      break;
    case StorageModes.S3:
      const s3Config = config.config as S3StorageConfig;
      const s3Client = new S3Client({ region: s3Config.region });
      adapter = new AwsS3StorageAdapter(s3Client, {
        bucket: s3Config.bucketName,
        ...(s3Config.rootFolder ? { prefix: s3Config.rootFolder } : {}),
      });
      break;
    default:
      throw new Error(`Unsupported storage mode: ${config.storageMode}`);
  }
  return adapter;
};
