import { AuthModes, StorageModes } from "../types/types";
import { JsonStorage } from "../entities/JsonStorage";
import { ErrorResponse } from "../utils/error";
import { Repository } from "typeorm";
import { AuthConfig, OIDCConfig } from "../interfaces/AuthConfig";
import { StatusCodes } from "http-status-codes";
import { StorageConfig } from "../interfaces/StorageConfig";
import assert from "assert";

export default class ConfigService {
  putConfig = async (repo: Repository<JsonStorage>, id: string, data: any): Promise<any> => {
    await repo.upsert([{ id, data, deletedAt: null }], ["id"]);
    return await this.getConfig(repo, id);
  };

  getConfig = async (repo: Repository<JsonStorage>, id: string): Promise<any> => {
    const row = await repo.findOneBy({ id });
    if (!row) {
      throw new ErrorResponse("Configuration not found", StatusCodes.NOT_FOUND);
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

  static getAuthConfig = (): AuthConfig => {
    const passwordConfigured = !!(process.env.SUPER_ADMIN_PASSWORD && process.env.DATA_ADMIN_PASSWORD && process.env.SELF_SIGNING_SECRET);
    const oidcConfigured = !!(process.env.OIDC_AUTHORITY && process.env.OIDC_CLIENT_ID && process.env.OIDC_REDIRECT_URI && process.env.OIDC_POST_LOGOUT_REDIRECT_URI && process.env.OIDC_SILENT_REDIRECT_URI && process.env.OIDC_SCOPE);

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
            rootFolder: process.env.LOCAL_STORAGE_ROOT_FOLDER || "/tmp/soilhive-storage",
          },
        };
      case StorageModes.S3:
        for (const name of ["S3_STORAGE_REGION", "S3_STORAGE_BUCKET", "S3_STORAGE_ROOT_FOLDER"]) {
          assert(process.env[name], `Environment variable ${name} must be set for S3 storage mode`);
        }
        return {
          storageMode,
          config: {
            region: process.env.S3_STORAGE_REGION!,
            bucketName: process.env.S3_STORAGE_BUCKET!,
            rootFolder: process.env.S3_STORAGE_ROOT_FOLDER!,
          },
        };
      default:
        throw new Error(`Unsupported storage mode: ${storageMode}`);
    }
  };
}
