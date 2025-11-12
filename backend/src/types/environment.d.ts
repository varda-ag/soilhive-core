declare namespace NodeJS {
  interface ProcessEnv {
    readonly PORT?: string;
    readonly JEST_WORKER_ID?: string;
    readonly NODE_ENV?: "development" | "production" | "test";
    // Postgres connection env vars
    readonly POSTGRES_HOST?: string;
    readonly POSTGRES_PORT?: string;
    readonly POSTGRES_DB?: string;
    readonly POSTGRES_USER?: string;
    readonly POSTGRES_PASSWORD?: string;
    readonly POSTGRES_SCHEMA?: string;
    // Auth settings
    readonly AUTH_JWKS_URL?: string;
    readonly AUTH_AUDIENCE?: string;
    readonly AUTH_ISSUER?: string;
  }
}
