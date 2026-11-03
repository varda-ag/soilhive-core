import { EntityManager } from 'typeorm';
import RasterFilterEntity from '../entities/RasterFilter';
import { EnabledRasterFilterTable, RasterFilterWithEnabled } from '../interfaces/RasterFilter';

// A leaf on purpose: utils/cache-epoch and SoilDataStorage import it, and anything heavier (the
// services, PgBoss) leads back to FilterService, which constructs SoilDataStorage at module load.

/**
 * Which of the given names exist in the current schema: as tables, or with `anyRelation` as any
 * relation at all, since indexes, sequences and views share the tables' namespace.
 */
export async function existingRelations(entityManager: EntityManager, names: string[], anyRelation = false): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  // A plain query rather than queryRunner.hasTable: the pool's default manager has no queryRunner,
  // and opening one here would take a second connection from inside a request's transaction.
  const rows: { relname: string }[] = await entityManager.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND c.relname = ANY($1) AND ($2 OR c.relkind IN ('r', 'p'))`,
    [names, anyRelation],
  );
  return new Set(rows.map(row => row.relname));
}

/** `enabled`: the backing raster table exists and there are labels to select. */
export async function withEnabled(entityManager: EntityManager, entities: RasterFilterEntity[]): Promise<RasterFilterWithEnabled[]> {
  const tables = await existingRelations(
    entityManager,
    entities.map(e => e.id),
  );
  return entities.map(entity => ({
    ...entity,
    enabled: Boolean(tables.has(entity.id) && entity.mappings && Object.keys(entity.mappings).length > 0),
  }));
}

/** The Raster Filters users can select: active and enabled. */
export async function getActiveRasterFilters(entityManager: EntityManager): Promise<RasterFilterWithEnabled[]> {
  const entities = await entityManager.getRepository(RasterFilterEntity).find();
  return (await withEnabled(entityManager, entities)).filter(f => f.enabled && f.active);
}

const ENABLED_RASTER_FILTER_TABLES_TTL_MS = 30 * 60 * 1000;
let enabledRasterFilterTablesCache: { value: EnabledRasterFilterTable[]; expiresAt: number } | undefined;

// Cleared on every cache epoch change (utils/cache-epoch.ts), so a Raster Filter activated,
// labelled or deleted on one node is seen by the others within a poll interval. Tests clear it
// too: the cache outlives any single DB state.
export const resetEnabledRasterFilterTablesCache = (): void => {
  enabledRasterFilterTablesCache = undefined;
};

// Reads on the caller's entityManager, never a connection of its own: a request already holds one
// pooled connection for its transaction, and waiting on a second deadlocks the pool once every
// connection is held by a request doing the same.
export const getEnabledRasterFilterTables = async (entityManager: EntityManager): Promise<EnabledRasterFilterTable[]> => {
  if (enabledRasterFilterTablesCache && enabledRasterFilterTablesCache.expiresAt > Date.now()) {
    return enabledRasterFilterTablesCache.value;
  }
  const value = (await getActiveRasterFilters(entityManager)).map(f => ({ id: f.id, resolutionM: f.resolution_m }));
  enabledRasterFilterTablesCache = { value, expiresAt: Date.now() + ENABLED_RASTER_FILTER_TABLES_TTL_MS };
  return value;
};
