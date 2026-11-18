import { setupEnv } from './utils';

setupEnv();

// On its own, away from services/PgBoss, so code the job workers import can name the schema
// without an import loop.
export const PG_BOSS_SCHEMA = `${process.env.POSTGRES_SCHEMA!}_pgboss`;
