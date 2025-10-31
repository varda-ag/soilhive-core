declare namespace NodeJS {
  interface ProcessEnv {
    readonly PORT?: string;
    readonly JEST_WORKER_ID?: string;
    readonly NODE_ENV?: "development" | "production" | "test";
    readonly POSTGRES_HOST?: string;
    readonly POSTGRES_PORT?: string;
    readonly POSTGRES_DB?: string;
    readonly POSTGRES_USER?: string;
    readonly POSTGRES_PASSWORD?: string;
    readonly POSTGRES_SCHEMA?: string;
  }
}
