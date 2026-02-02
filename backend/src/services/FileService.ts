import fs from 'fs';
import { S3Client } from '@aws-sdk/client-s3';
import { FileStorage } from '@flystorage/file-storage';
import { AwsS3StorageAdapter } from '@flystorage/aws-s3';
import { LocalStorageAdapter } from '@flystorage/local-fs';
import { FlystorageMulterStorageEngine } from '@flystorage/multer-storage';
import { LocalStorageConfig, S3StorageConfig, StorageConfig } from '../interfaces/StorageConfig';
import { RequestData } from '../interfaces/RequestData';
import { File } from '../interfaces/File';
import { StorageModes } from '../types/enums';
import ConfigService from './ConfigService';
import { LOGO_FILE_ID } from '../constants/constants';
import FileEntity from '../entities/File';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';

export default class FileService {
  exists = async (fileId: string): Promise<boolean> => {
    const storage = await FileService.getStorageEngine();
    return await storage.fileExists(fileId);
  };

  deleteFile = async (fileId: string): Promise<void> => {
    const storage = await FileService.getStorageEngine();
    await storage.deleteFile(fileId);
  };

  static getUploadStorageEngine = (): FlystorageMulterStorageEngine => {
    const adapter = FileService.getAdapter();
    const fileStorage = new FileStorage(adapter);
    const storage = new FlystorageMulterStorageEngine(fileStorage, async (action, req, file) => {
      if (action === 'handle') {
        if (req.path === '/frontend/logo') {
          // Special case for logo upload
          return LOGO_FILE_ID;
        }
        // Use ID parameter to setup filename
        return req.params['fileId']!;
      } else {
        // Return folder name/destination if needed
        return file.destination;
      }
    });
    return storage;
  };

  static getStorageEngine = (): FileStorage => {
    const adapter = FileService.getAdapter();
    return new FileStorage(adapter);
  };

  static getAdapter = (): any => {
    // Creates adapter based on storage config (TODO: caching?)
    let adapter: any;
    const config: StorageConfig = ConfigService.getStorageConfig();
    switch (config.storageMode) {
      case StorageModes.LOCAL: {
        const localConfig = config.config as LocalStorageConfig;
        if (!fs.existsSync(localConfig.rootFolder)) {
          fs.mkdirSync(localConfig.rootFolder, { recursive: true });
        }
        adapter = new LocalStorageAdapter(localConfig.rootFolder);
        break;
      }
      case StorageModes.S3: {
        const s3Config = config.config as S3StorageConfig;
        const s3Client = new S3Client({ region: s3Config.region }) as any;
        adapter = new AwsS3StorageAdapter(s3Client, {
          bucket: s3Config.bucketName,
          ...(s3Config.rootFolder ? { prefix: s3Config.rootFolder } : {}),
        });
        break;
      }
      default:
        throw new Error(`Unsupported storage mode: ${config.storageMode}`);
    }
    return adapter;
  };

  getFiles = async (requestData: RequestData): Promise<File[]> => {
    const repo = requestData.entityManager.getRepository(FileEntity);
    return await repo.find();
  };

  getFile = async (requestData: RequestData, slug: string): Promise<File> => {
    return await getEntity(requestData, FileEntity, EntityType.FILE, slug);
  };
}
