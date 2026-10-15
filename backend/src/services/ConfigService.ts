import { AuthModes, StorageModes } from '../types/enums';
import { JsonStorage } from '../entities/JsonStorage';
import { ErrorResponse } from '../utils/error';
import { In, Repository } from 'typeorm';
import { AuthConfig, OIDCConfig } from '../interfaces/AuthConfig';
import { StatusCodes } from 'http-status-codes';
import { PublicStorageConfig, StorageConfig } from '../interfaces/StorageConfig';
import { PluginBackend } from '../interfaces/PluginBackend';
import assert from 'assert';
import { FRONTEND_LOGO_CONFIG_ID, PLUGIN_CONFIG_ID_PATTERN } from '../constants/constants';
import { RequestData } from '../interfaces/RequestData';
import EntitlementService from './EntitlementService';
import { EntitlementScope } from '../types/Entitlements';

const DEFAULT_MAX_UPLOAD_SIZE_MB = 500;
const DEFAULT_S3_STORAGE_PART_SIZE_MB = 64;
const DEFAULT_S3_STORAGE_QUEUE_SIZE = 4;
const DEFAULT_PLUGIN_BACKEND_TIMEOUT_MS = 60_000;
const MIN_PLUGIN_BACKEND_SECRET_LENGTH = 32;

const entitlementService = new EntitlementService();

export interface LogoData {
  fileKey: string;
  // Base64-encoded logo bytes. Absent for legacy logos still served from storage (see ADR 0015).
  bytes?: string;
}

export default class ConfigService {
  private readConfigRow = async (repo: Repository<JsonStorage>, id: string): Promise<any> => {
    const row = await repo.findOneBy({ id });
    if (!row) {
      throw new ErrorResponse('Configuration not found', StatusCodes.NOT_FOUND);
    }
    return row.data;
  };

  /**
   * `PUT /configs/{configId}`. A caller who already holds `WRITE` (or is privileged) upserts as
   * before. Otherwise, only a fresh `plugin:` id is eligible for first access: a conflict-
   * detecting insert (`ON CONFLICT DO NOTHING`, not `upsert`, which would let a concurrent racer
   * silently overwrite the winner) either claims the id — granting the caller `WRITE` on it in
   * the same transaction — or loses the race/finds it already taken (including soft-deleted,
   * since the row's PK still exists) and 403s without writing anything. See ADR 0037.
   */
  putConfig = async (requestData: RequestData, id: string, data: any): Promise<any> => {
    const repo = requestData.entityManager.getRepository(JsonStorage);

    if (entitlementService.canWriteConfig(requestData, id)) {
      await repo.upsert([{ id, data, deleted_at: null }], ['id']);
      return this.readConfigRow(repo, id);
    }

    if (!PLUGIN_CONFIG_ID_PATTERN.test(id)) {
      throw new ErrorResponse(`User does not have write entitlement for config ${id}`, StatusCodes.FORBIDDEN);
    }

    // `id` is a caller-supplied (not DB-generated) primary key, so `insertResult.identifiers`
    // is populated from the values given regardless of whether ON CONFLICT DO NOTHING actually
    // skipped the row — it is not a reliable "did I win the race" signal here. `.returning('id')`
    // is: Postgres only returns rows RETURNING actually inserted, so an empty `raw` means lost.
    const insertResult = await repo
      .createQueryBuilder()
      .insert()
      .into(JsonStorage)
      .values({ id, data, deleted_at: null })
      .orIgnore()
      .returning('id')
      .execute();
    if (insertResult.raw.length === 0) {
      throw new ErrorResponse(`User does not have write entitlement for config ${id}`, StatusCodes.FORBIDDEN);
    }

    await entitlementService.grantSelfConfigWrite(requestData, id);
    return this.readConfigRow(repo, id);
  };

  // Existence before entitlement: a missing id 404s for every caller, not 403 first. The
  // frontend's notFoundAsNull only maps 404 to a graceful null — a 403 isn't special-cased and
  // gets retried by React Query's default retry, which a fresh, not-yet-created plugin: config
  // (the common case, since nobody holds a grant on it yet) would otherwise hit on every load.
  getConfig = async (requestData: RequestData, id: string): Promise<any> => {
    const repo = requestData.entityManager.getRepository(JsonStorage);
    const data = await this.readConfigRow(repo, id);
    await entitlementService.assertCanReadConfigEntitlement(requestData, id);
    return data;
  };

  // A plugin item's grants go with it, for every subject; a host item keeps them, so deleting and
  // re-saving `theme` doesn't drop EVERYONE's read (ADR 0037). Attached Data Requests are destroyed
  // by the controller (see controllers/configs.ts).
  deleteConfig = async (requestData: RequestData, id: string): Promise<void> => {
    await entitlementService.assertCanWriteConfigEntitlement(requestData, id);
    const repo = requestData.entityManager.getRepository(JsonStorage);
    await repo.softDelete({ id });
    if (PLUGIN_CONFIG_ID_PATTERN.test(id)) {
      await entitlementService.deleteEntityEntitlements(requestData, EntitlementScope.CONFIGS, id);
    }
  };

  /**
   * Silently omits ids the caller can't read from the result map — the same precedent
   * `getConfigs` already sets for ids that don't exist at all (see ADR 0037).
   */
  getConfigs = async (requestData: RequestData, ids: string[]): Promise<any> => {
    const repo = requestData.entityManager.getRepository(JsonStorage);
    const rows = await repo.find({ where: { id: In(ids) } });
    const readableRows = rows.filter(row => entitlementService.canReadConfig(requestData, row.id));
    return this.mapRowsById(readableRows);
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

  /**
   * The Plugin Backends this deployment forwards /plugins/{pluginId}/ to, by pluginId. Only the
   * deployment's environment names them, never a request: a URL taken from a request would let
   * any caller point the core backend at any address it can reach (docs/adr/0062). Parsed once
   * per value of the two variables, which in a running deployment means once, and a malformed
   * value throws the same error on every call.
   */
  static getPluginBackends = (): Map<string, PluginBackend> => {
    const raw = `${process.env.PLUGIN_BACKENDS ?? ''}\n${process.env.PLUGIN_BACKEND_SECRETS ?? ''}`;
    if (pluginBackends?.raw !== raw) {
      try {
        pluginBackends = { raw, backends: parsePluginBackends() };
      } catch (error) {
        pluginBackends = { raw, error: error as Error };
      }
    }
    if ('error' in pluginBackends) throw pluginBackends.error;
    return pluginBackends.backends;
  };

  static getPluginBackendTimeoutMs = (): number => {
    const parsed = Number(process.env.PLUGIN_BACKEND_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PLUGIN_BACKEND_TIMEOUT_MS;
  };
}

let pluginBackends: ({ raw: string } & ({ backends: Map<string, PluginBackend> } | { error: Error })) | undefined;

const parsePluginBackends = (): Map<string, PluginBackend> => {
  const urls = parsePluginIdMap('PLUGIN_BACKENDS');
  const secrets = parsePluginIdMap('PLUGIN_BACKEND_SECRETS');
  for (const pluginId of secrets.keys()) {
    if (!urls.has(pluginId)) {
      throw new Error(`PLUGIN_BACKEND_SECRETS has a secret for "${pluginId}", which PLUGIN_BACKENDS does not list`);
    }
  }

  const backends = new Map<string, PluginBackend>();
  for (const [pluginId, value] of urls) {
    const url = URL.canParse(value) ? new URL(value) : undefined;
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(`PLUGIN_BACKENDS: "${pluginId}" must be an http(s) URL with no credentials, query or fragment`);
    }
    const secret = secrets.get(pluginId) ?? '';
    if (secret.length < MIN_PLUGIN_BACKEND_SECRET_LENGTH) {
      throw new Error(`PLUGIN_BACKEND_SECRETS: "${pluginId}" needs a secret of at least ${MIN_PLUGIN_BACKEND_SECRET_LENGTH} characters`);
    }
    // So a call's path is appended to the base path rather than replacing its last segment.
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    backends.set(pluginId, { url, secret });
  }
  return backends;
};

// A JSON object from pluginId to string. JSON.parse's own message is not passed on: it quotes the
// input, which for PLUGIN_BACKEND_SECRETS is a secret.
const parsePluginIdMap = (name: 'PLUGIN_BACKENDS' | 'PLUGIN_BACKEND_SECRETS'): Map<string, string> => {
  const raw = process.env[name]?.trim();
  if (!raw) return new Map();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some(value => typeof value !== 'string')
  ) {
    throw new Error(`${name} must be a JSON object from pluginId to string`);
  }
  return new Map(Object.entries(parsed as Record<string, string>));
};
