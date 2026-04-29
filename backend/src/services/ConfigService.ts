import { AuthModes, StorageModes } from '../types/enums';
import { JsonStorage } from '../entities/JsonStorage';
import { ErrorResponse } from '../utils/error';
import { Repository } from 'typeorm';
import { AuthConfig, OIDCConfig } from '../interfaces/AuthConfig';
import { StatusCodes } from 'http-status-codes';
import { StorageConfig } from '../interfaces/StorageConfig';
import assert from 'assert';

const FRONTEND_LOGO = 'frontend-logo';

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

  exportConfigs = async (repo: Repository<JsonStorage>): Promise<any> => {
    const rows = await repo.find();
    const output = {};
    for (const r of rows) {
      output[r.id] = r.data;
    }
    return output;
  };

  async getLogoFileKey(repo: Repository<JsonStorage>): Promise<string | undefined> {
    const row = await repo.findOneBy({ id: FRONTEND_LOGO });
    if (!row) {
      return undefined;
    }
    return row.data['fileKey'];
  }

  setLogoFileKey = async (repo: Repository<JsonStorage>, fileKey: string): Promise<void> => {
    await repo.upsert([{ id: FRONTEND_LOGO, data: { fileKey }, deleted_at: null }], ['id']);
  };

  deleteLogoFileKey = async (repo: Repository<JsonStorage>): Promise<void> => {
    await repo.softDelete({ id: FRONTEND_LOGO });
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
      case StorageModes.S3:
        for (const name of ['S3_STORAGE_REGION', 'S3_STORAGE_BUCKET', 'S3_STORAGE_ROOT_FOLDER']) {
          assert(process.env[name], `Environment variable ${name} must be set for S3 storage mode`);
        }
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
          },
        };
      default:
        throw new Error(`Unsupported storage mode: ${storageMode}`);
    }
  };
}
