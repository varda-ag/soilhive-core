import os from 'os';
import path from 'path';

/**
 * Jest sets JEST_WORKER_ID in every worker, and to "1" when running in band. It is undefined in
 * globalSetup, which runs before any worker is forked, so that phase acts as worker 1.
 */
export const workerId = (): string => process.env.JEST_WORKER_ID ?? '1';

/** Each worker owns a schema, so workers never see each other's rows or each other's TRUNCATEs. */
export const schemaForWorker = (id: string = workerId()): string => `testschema_${id}`;

/**
 * The real temp directory, remembered before TMPDIR is redirected at worker startup (see
 * tests/jest.env.ts). Kept in the environment rather than in a module variable because each test
 * file gets a fresh module registry while process.env persists, so a plain `os.tmpdir()` here
 * would read back the redirected value and nest one worker directory inside the last.
 */
const BASE_TMP_DIR = (process.env['SOILHIVE_TEST_BASE_TMPDIR'] ??= os.tmpdir());

export const tmpDirForWorker = (id: string = workerId()): string => path.join(BASE_TMP_DIR, `soilhive-test-${id}`);

export const setupTestEnv = () => {
  const env = {
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_DB: 'database',
    POSTGRES_USER: 'dbuser',
    POSTGRES_PASSWORD: 'dbpass',
    POSTGRES_SCHEMA: schemaForWorker(),
    SUPER_ADMIN_PASSWORD_HASH: '$2a$10$OaWUPUR7csoiBYqzp3jq8.s336/WXRvMIWGFluF3BvO/6l/0TYHMq',
    DATA_ADMIN_PASSWORD_HASH: '$2a$10$.oAbT7ZPV75DAhmYTSgW3ucDSFj00wvN/R.bq8.4Y1gL.aQxYAMQ2',
    SELF_SIGNING_SECRET: 'put-any-random-string-here',
    AWS_ROLE_ARN: undefined,
    AWS_PROFILE: undefined,
    AWS_DEFAULT_REGION: 'eu-central-1',
    AWS_S3_ENDPOINT: 'localhost:9000',
    AWS_NO_SIGN_REQUEST: undefined,
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'testtest1',
    AWS_VIRTUAL_HOSTING: 'FALSE',
    AWS_HTTPS: 'NO',
    STORAGE_MODE: 'local',
    LOCAL_STORAGE_ROOT_FOLDER: path.join(tmpDirForWorker(), 'soilhive-storage'),
    PORT: undefined,
    POSTGRES_AWS_REGION: undefined,
    OIDC_JWKS_URL: undefined,
    OIDC_AUTHORITY: undefined,
    OIDC_CLIENT_ID: undefined,
    OIDC_REDIRECT_URI: undefined,
    OIDC_POST_LOGOUT_REDIRECT_URI: undefined,
    OIDC_SILENT_REDIRECT_URI: undefined,
    OIDC_SCOPE: undefined,
    S3_STORAGE_REGION: 'eu-central-1',
    S3_STORAGE_BUCKET: 'varda-local-euc1-soilhive',
    S3_STORAGE_ROOT_FOLDER: 'Original_Data',
    S3_STORAGE_ENDPOINT: 'http://localhost:9000',
    ENTITLEMENTS_ENDPOINT: undefined,
    EXPORT_BATCH_SIZE: 100,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value) {
      process.env[key] = value.toString();
    } else {
      delete process.env[key];
    }
  }
};
