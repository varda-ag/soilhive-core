declare namespace NodeJS {
  interface ProcessEnv {
    // Server settings
    readonly PORT?: string;
    readonly JSON_PAYLOAD_LIMIT?: string;
    readonly JEST_WORKER_ID?: string;
    readonly NODE_ENV?: 'development' | 'production' | 'test';
    readonly LOOPBACK_URL?: string;
    readonly LOG_LEVEL?: string;
    readonly JOB_LOCAL_CONCURRENCY?: string;
    readonly JOB_GROUP_CONCURRENCY?: string;
    // Postgres connection env vars
    readonly POSTGRES_HOST?: string;
    readonly POSTGRES_PORT?: string;
    readonly POSTGRES_DB?: string;
    readonly POSTGRES_USER?: string;
    readonly POSTGRES_PASSWORD?: string;
    readonly POSTGRES_SCHEMA?: string;
    readonly POSTGRES_AWS_REGION?: string;
    // Auth settings
    readonly SUPER_ADMIN_PASSWORD_HASH?: string;
    readonly DATA_ADMIN_PASSWORD_HASH?: string;
    readonly SELF_SIGNING_SECRET?: string;
    readonly ENTITLEMENTS_ENDPOINT?: string;
    // OIDC settings
    readonly OIDC_JWKS_URL?: string;
    readonly OIDC_AUTHORITY?: string;
    readonly OIDC_CLIENT_ID?: string;
    readonly OIDC_REDIRECT_URI?: string;
    readonly OIDC_POST_LOGOUT_REDIRECT_URI?: string;
    readonly OIDC_SILENT_REDIRECT_URI?: string;
    readonly OIDC_SCOPE?: string;
    // Storage settings
    readonly STORAGE_MODE?: string;
    readonly LOCAL_STORAGE_ROOT_FOLDER?: string;
    readonly S3_STORAGE_REGION?: string;
    readonly S3_STORAGE_BUCKET?: string;
    readonly S3_STORAGE_ROOT_FOLDER?: string;
    readonly S3_STORAGE_ENDPOINT?: string;
    readonly AWS_S3_ENDPOINT?: string;
    readonly AWS_ACCESS_KEY_ID?: string;
    readonly AWS_SECRET_ACCESS_KEY?: string;
    readonly AWS_VIRTUAL_HOSTING?: string;
    readonly AWS_HTTPS?: string;
  }
}
