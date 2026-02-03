export const setupTestEnv = () => {
  const env = {
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5433,
    POSTGRES_DB: 'database',
    POSTGRES_USER: 'dbuser',
    POSTGRES_PASSWORD: 'dbpass',
    POSTGRES_SCHEMA: 'testschema',
    SUPER_ADMIN_PASSWORD_HASH: '$2a$10$OaWUPUR7csoiBYqzp3jq8.s336/WXRvMIWGFluF3BvO/6l/0TYHMq',
    DATA_ADMIN_PASSWORD_HASH: '$2a$10$.oAbT7ZPV75DAhmYTSgW3ucDSFj00wvN/R.bq8.4Y1gL.aQxYAMQ2',
    SELF_SIGNING_SECRET: 'put-any-random-string-here',
    AWS_ROLE_ARN: 'arn:aws:iam::000000000000:role/localstack-role',
    AWS_PROFILE: 'localstack',
    STORAGE_MODE: 'local',
    LOCAL_STORAGE_ROOT_FOLDER: '/tmp/soilhive-storage',
  };
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value.toString();
  }
};
