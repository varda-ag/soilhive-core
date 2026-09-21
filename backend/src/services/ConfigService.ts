import { AuthModes, StorageModes } from '../types/enums';
import { JsonStorage } from '../entities/JsonStorage';
import { ErrorResponse } from '../utils/error';
import { In, Repository } from 'typeorm';
import { AuthConfig, OIDCConfig } from '../interfaces/AuthConfig';
import { StatusCodes } from 'http-status-codes';
import { PublicStorageConfig, StorageConfig } from '../interfaces/StorageConfig';
import assert from 'assert';
import { FRONTEND_LOGO_CONFIG_ID } from '../constants/constants';

const DEFAULT_MAX_UPLOAD_SIZE_MB = 500;
const DEFAULT_S3_STORAGE_PART_SIZE_MB = 64;
const DEFAULT_S3_STORAGE_QUEUE_SIZE = 4;

export interface LogoData {
  fileKey: string;
  // Base64-encoded logo bytes. Absent for legacy logos still served from storage (see ADR 0015).
  bytes?: string;
}

export default class ConfigService {
  putConfig = async (repo: Repository<JsonStorage>, id: string, data: any): Promise<any> => {
    await repo.upsert([{ id, data, deleted_at: null }], ['id']);
    return await this.getConfig(repo, id);
  };

  getConfig = async (repo: Repository<JsonStorage>, id: string): Promise<any> => {
    const row = await repo.findOneBy({ id });
    if (!row) {
      throw new ErrorResponse('Configuration not found', StatusCodes.NOT_FOUND);
    }
    return row.data;
  };

  deleteConfig = async (repo: Repository<JsonStorage>, id: string): Promise<void> => {
    await repo.softDelete({ id });
  };

  getConfigs = async (repo: Repository<JsonStorage>, ids: string[]): Promise<any> => {
    const rows = await repo.find({ where: { id: In(ids) } });
    return this.mapRowsById(rows);
  };

  exportConfigs = async (repo: Repository<JsonStorage>): Promise<any> => {
    const rows = await repo.find();
    return this.mapRowsById(rows);
  };

  private mapRowsById = (rows: JsonStorage[]): Record<string, unknown> => {
    const output: Record<string, unknown> = {};
    for (const r of rows) {
      output[r.id] = r.data;
    }
    return output;
  };

  async getLogoData(repo: Repository<JsonStorage>): Promise<LogoData | undefined> {
    const row = await repo.findOneBy({ id: FRONTEND_LOGO_CONFIG_ID });
    if (!row) {
      return undefined;
    }
    return row.data as LogoData;
  }

  setLogo = async (repo: Repository<JsonStorage>, data: LogoData): Promise<void> => {
    await repo.upsert([{ id: FRONTEND_LOGO_CONFIG_ID, data, deleted_at: null }], ['id']);
  };

  deleteLogo = async (repo: Repository<JsonStorage>): Promise<void> => {
    await repo.softDelete({ id: FRONTEND_LOGO_CONFIG_ID });
  };

  static getAuthConfig = (): AuthConfig => {
    const passwordConfigured = !!(
      process.env.SUPER_ADMIN_PASSWORD_HASH &&
      process.env.DATA_ADMIN_PASSWORD_HASH &&
      process.env.SELF_SIGNING_SECRET
    );
    const oidcConfigured = !!(
      process.env.OIDC_JWKS_URL && // This value will not be part of the output to avoid leaking sensitive information, but it's required to validate tokens
      process.env.OIDC_AUTHORITY &&
      process.env.OIDC_CLIENT_ID &&
      process.env.OIDC_REDIRECT_URI &&
      process.env.OIDC_POST_LOGOUT_REDIRECT_URI &&
      process.env.OIDC_SILENT_REDIRECT_URI &&
      process.env.OIDC_SCOPE
    );

    if (!passwordConfigured && !oidcConfigured) {
      return { authMode: AuthModes.NONE };
    }

    if (passwordConfigured && !oidcConfigured) {
      return { authMode: AuthModes.PASSWORD };
    }

    const oidcConfig: OIDCConfig = {
      authority: process.env.OIDC_AUTHORITY!,
      clientId: process.env.OIDC_CLIENT_ID!,
      redirectUri: process.env.OIDC_REDIRECT_URI!,
      postLogoutRedirectUri: process.env.OIDC_POST_LOGOUT_REDIRECT_URI!,
      silentRedirectUri: process.env.OIDC_SILENT_REDIRECT_URI!,
      scope: process.env.OIDC_SCOPE!,
    };

    return {
      authMode: AuthModes.OIDC,
      oidcConfig,
    };
  };

  static getStorageConfig = (): StorageConfig => {
    const storageMode = process.env.STORAGE_MODE || StorageModes.LOCAL;
    switch (storageMode) {
      case StorageModes.LOCAL:
        return {
          storageMode,
          config: {
            rootFolder: process.env.LOCAL_STORAGE_ROOT_FOLDER || '/tmp/soilhive-storage',
          },
        };
      case StorageModes.S3: {
        for (const name of ['S3_STORAGE_REGION', 'S3_STORAGE_BUCKET', 'S3_STORAGE_ROOT_FOLDER']) {
          assert(process.env[name], `Environment variable ${name} must be set for S3 storage mode`);
        }
        const parsedPartSizeMB = Number(process.env.S3_STORAGE_PART_SIZE_MB);
        const uploadPartSizeMB =
          Number.isFinite(parsedPartSizeMB) && parsedPartSizeMB >= 5 ? parsedPartSizeMB : DEFAULT_S3_STORAGE_PART_SIZE_MB;
        const parsedQueueSize = Number(process.env.S3_STORAGE_QUEUE_SIZE);
        const uploadQueueSize = Number.isFinite(parsedQueueSize) && parsedQueueSize > 0 ? parsedQueueSize : DEFAULT_S3_STORAGE_QUEUE_SIZE;
        return {
          storageMode,
          config: {
            region: process.env.S3_STORAGE_REGION!,
            bucketName: process.env.S3_STORAGE_BUCKET!,
            rootFolder: process.env.S3_STORAGE_ROOT_FOLDER!,
            ...(process.env.S3_STORAGE_ENDPOINT ? { endpoint: process.env.S3_STORAGE_ENDPOINT } : {}),
            ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
              ? { credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } }
              : {}),
            uploadPartSizeBytes: uploadPartSizeMB * 1024 * 1024,
            uploadQueueSize,
          },
        };
      }
      default:
        throw new Error(`Unsupported storage mode: ${storageMode}`);
    }
  };

  static getMaxUploadSizeBytes = (): number => {
    const parsed = Number(process.env.MAX_UPLOAD_SIZE_MB);
    const maxUploadSizeMB = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_SIZE_MB;
    return maxUploadSizeMB * 1024 * 1024;
  };

  static getPublicStorageConfig = (): PublicStorageConfig => {
    const { storageMode } = ConfigService.getStorageConfig();
    return {
      storageMode,
      maxUploadSizeMB: ConfigService.getMaxUploadSizeBytes() / (1024 * 1024),
    };
  };
}
