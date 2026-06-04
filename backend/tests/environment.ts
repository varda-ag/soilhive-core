export const setupTestEnv = () => {
  const env = {
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_DB: 'database',
    POSTGRES_USER: 'dbuser',
    POSTGRES_PASSWORD: 'dbpass',
    POSTGRES_SCHEMA: 'testschema',
    SUPER_ADMIN_PASSWORD_HASH: '$2a$10$OaWUPUR7csoiBYqzp3jq8.s336/WXRvMIWGFluF3BvO/6l/0TYHMq',
    DATA_ADMIN_PASSWORD_HASH: '$2a$10$.oAbT7ZPV75DAhmYTSgW3ucDSFj00wvN/R.bq8.4Y1gL.aQxYAMQ2',
    SELF_SIGNING_SECRET: 'put-any-random-string-here',
    AWS_ROLE_ARN: 'arn:aws:iam::000000000000:role/localstack-role',
    AWS_PROFILE: 'localstack',
    AWS_DEFAULT_REGION: 'eu-central-1',
    AWS_S3_ENDPOINT: 'localhost:4566',
    AWS_NO_SIGN_REQUEST: 'YES',
    AWS_ACCESS_KEY_ID: 'test',
    AWS_SECRET_ACCESS_KEY: 'test',
    AWS_VIRTUAL_HOSTING: 'FALSE',
    AWS_HTTPS: 'NO',
    STORAGE_MODE: 'local',
    LOCAL_STORAGE_ROOT_FOLDER: '/tmp/soilhive-storage',
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
    S3_STORAGE_ENDPOINT: 'http://localhost:4566',
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
