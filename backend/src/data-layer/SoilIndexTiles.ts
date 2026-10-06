import { EntityManager } from 'typeorm';
import { promisify } from 'util';
import { gunzip, gzip } from 'zlib';
import { validate } from 'uuid';
import { LRUCache } from 'lru-cache';
import {
  MERCATOR_MAX_LATITUDE,
  scoredGeometriesSql,
  soilIndexTilesPartition,
  tileColumnSql,
  tileRowSql,
  tileVerticesSql,
} from './SoilIndex';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Bumped whenever how tiles are produced changes. Tiles are immutable to clients, so a new
 * version in their URLs is the only way such a change reaches a browser that cached the old ones
 * (docs/adr/0043). Pre-rendered tiles are stamped with it: after a bump, a Run's are cut on request
 * until they are rendered again.
 */
export const TILING_VERSION = 1;

/** The one MVT layer, at every zoom. */
export const TILE_LAYER = 'scores';

const EXTENT = 4096;
const BUFFER = 64;

/** Below the detail zoom a tile is 2^6 = 64 cells a side. */
const CELL_ZOOM_OFFSET = 6;

/**
 * Cell ids start above every row id (`soil_index.id` is an integer) and stay below 2^53, the
 * largest integer MapLibre holds exactly, so a hover state never lands on the wrong feature.
 */
const CELL_ID_BASE = 2 ** 31;
const CELL_ID_MASK = 2 ** 52 - 1;

export interface TileAddress {
  z: number;
  x: number;
  y: number;
}

/** What a Run's tiles need from `soil_index_runs`. */
export interface SoilIndexTiling {
  /** [west, south, east, north] in EPSG:4326; null when the Run scored nothing. */
  bounds: [number, number, number, number] | null;
  /** First zoom drawn as Scored Geometries rather than cells; null when the Run scored nothing. */
  detailZoom: number | null;
}

// A Run's row never changes once written, so it is cached on every tile request's path. The TTL
// bounds how long another node keeps serving a Run that was rebuilt or destroyed (docs/adr/0044).
const tilingCache = new LRUCache<string, SoilIndexTiling>({ max: 1024, ttl: 10 * 60_000 });

/** Null for an unknown Run, a failed one, or one still running: its row is written with its partition. */
export async function getSoilIndexTiling(entityManager: EntityManager, run: string): Promise<SoilIndexTiling | null> {
  if (!validate(run)) {
    return null;
  }
  const cached = tilingCache.get(run);
  if (cached) {
    return cached;
  }
  const tiling = await readSoilIndexTiling(entityManager, run);
  if (tiling) {
    tilingCache.set(run, tiling);
  }
  return tiling;
}

/** Drops this node's cached tiling of a Run, once it is known to be gone. */
export const forgetSoilIndexTiling = (run: string): void => {
  tilingCache.delete(run);
};

const readSoilIndexTiling = async (entityManager: EntityManager, run: string): Promise<SoilIndexTiling | null> => {
  const [row]: { west: number | null; south: number | null; east: number | null; north: number | null; detail_zoom: number | null }[] =
    await entityManager.query(
      `SELECT ST_XMin(bounds) AS west, ST_YMin(bounds) AS south, ST_XMax(bounds) AS east, ST_YMax(bounds) AS north, detail_zoom
       FROM "${process.env.POSTGRES_SCHEMA}"."soil_index_runs"
       WHERE run = $1 AND status = 'completed'`,
      [run],
    );
  if (!row) {
    return null;
  }
  return {
    bounds: row.west === null ? null : [Number(row.west), Number(row.south), Number(row.east), Number(row.north)],
    detailZoom: row.detail_zoom,
  };
};

/**
 * A tile's extent as [west, south, east, north] in EPSG:4326, widened by `margin` tiles. Computed
 * here rather than by transforming ST_TileEnvelope: a widened edge tile reaches past ±180°, which
 * PROJ wraps to the far side of the globe. Clamped to the globe, and the top and bottom rows reach
 * the poles, matching tile coordinates, which place scores beyond Web Mercator's latitudes there.
 */
export function tileLonLatBounds({ z, x, y }: TileAddress, margin = 0): [number, number, number, number] {
  const tiles = 2 ** z;
  const longitude = (column: number) => Math.min(Math.max((column / tiles) * 360 - 180, -180), 180);
  const latitude = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / tiles))) * 180) / Math.PI;
  return [
    longitude(x - margin),
    y === tiles - 1 ? -90 : latitude(y + 1 + margin),
    longitude(x + 1 + margin),
    y === 0 ? 90 : latitude(y - margin),
  ];
}

/**
 * Whether a tile, widened by its render buffer, can hold anything of a Run with these bounds. A
 * tile outside them is answered without a query.
 */
export function tileTouchesBounds(tile: TileAddress, [west, south, east, north]: [number, number, number, number]): boolean {
  const [tileWest, tileSouth, tileEast, tileNorth] = tileLonLatBounds(tile, BUFFER / EXTENT);
  return tileWest <= east && tileEast >= west && tileSouth <= north && tileNorth >= south;
}

/**
 * A geometry brought inside Web Mercator's latitudes, so it can be projected: a point onto the
 * nearest edge, a polygon clipped at it. Without this, a score beyond them is clipped out of every
 * tile, and one at a pole fails the transform, and with it every tile it falls in.
 */
const withinMercatorSql = (geometry: string): string =>
  `CASE WHEN ST_GeometryType(${geometry}) = 'ST_Point'
     THEN ST_SetSRID(ST_MakePoint(ST_X(${geometry}), LEAST(GREATEST(ST_Y(${geometry}), -${MERCATOR_MAX_LATITUDE}), ${MERCATOR_MAX_LATITUDE})), 4326)
     ELSE ST_ClipByBox2D(${geometry}, ST_MakeEnvelope(-180, -${MERCATOR_MAX_LATITUDE}, 180, ${MERCATOR_MAX_LATITUDE}, 4326))
   END`;

/**
 * Scored Geometries clipped to the tile, each carrying its row id as the MVT feature id. $4..$7 are
 * the tile's buffered extent in EPSG:4326, for the index.
 */
const rawTileSql = (run: string): string =>
  `SELECT ST_AsMVT(features, '${TILE_LAYER}', ${EXTENT}, 'geom', 'id') AS mvt
   FROM (
     SELECT scored.id, scored.value::real AS value, scored.year,
            ST_AsMVTGeom(ST_Transform(${withinMercatorSql('scored.geometry')}, 3857), ST_TileEnvelope($1::int, $2::int, $3::int), ${EXTENT}, ${BUFFER}, true) AS geom
     FROM ${scoredGeometriesSql(run)} scored
     WHERE scored.geometry && ST_MakeEnvelope($4, $5, $6, $7, 4326)
   ) features
   WHERE features.geom IS NOT NULL`;

/**
 * One point per (cell, year), summarising the Scored Geometries whose representative point is in
 * the cell, a tile six zooms further in. Membership is by that point alone, so each score is
 * counted in exactly one cell of exactly one tile.
 *
 * The point is the centroid of the members' representative points, in Web Mercator: inside the
 * cell, and where its scores are. The cell's centre would draw a regular lattice, and its square a
 * coarse raster that jumps to dots at the detail zoom. It carries the members' summary, never one
 * member's own value, which would colour an area by one arbitrary score. $4..$7 are the tile's
 * extent in EPSG:4326, for the index.
 */
const cellTileSql = (run: string): string => {
  const cellZoom = `$1::int + ${CELL_ZOOM_OFFSET}`;
  return `SELECT ST_AsMVT(cells, '${TILE_LAYER}', ${EXTENT}, 'geom', 'id') AS mvt
   FROM (
     SELECT ${CELL_ID_BASE}::bigint + (hashtextextended(concat_ws(':', $1::int, cx, cy, year), 0) & ${CELL_ID_MASK}::bigint) AS id,
            avg(value)::real AS value,
            min(value)::real AS "min",
            max(value)::real AS "max",
            count(*)::int AS "count",
            year,
            ST_AsMVTGeom(ST_SetSRID(ST_MakePoint(avg(ST_X(projected)), avg(ST_Y(projected))), 3857), ST_TileEnvelope($1::int, $2::int, $3::int), ${EXTENT}, 0, false) AS geom
     FROM (
       SELECT scored.value, scored.year,
              ST_Transform(${withinMercatorSql('scored.point')}, 3857) AS projected,
              ${tileColumnSql('scored.point', cellZoom)} AS cx,
              ${tileRowSql('scored.point', cellZoom)} AS cy
       FROM ${scoredGeometriesSql(run)} scored
       WHERE scored.geometry && ST_MakeEnvelope($4, $5, $6, $7, 4326)
     ) placed
     WHERE cx >> ${CELL_ZOOM_OFFSET} = $2::int AND cy >> ${CELL_ZOOM_OFFSET} = $3::int
     GROUP BY cx, cy, year
   ) cells`;
};

/** One tile as uncompressed MVT, or null when nothing in it is drawn. `run` must be a validated uuid. */
export async function renderTile(entityManager: EntityManager, run: string, detailZoom: number, tile: TileAddress): Promise<Buffer | null> {
  const raw = tile.z >= detailZoom;
  // Raw geometries are drawn into the render buffer; a cell holds only what its point places in the tile.
  const extent = tileLonLatBounds(tile, raw ? BUFFER / EXTENT : 0);
  const [row]: { mvt: Buffer | null }[] = await entityManager.query(raw ? rawTileSql(run) : cellTileSql(run), [
    tile.z,
    tile.x,
    tile.y,
    ...extent,
  ]);
  return row?.mvt && row.mvt.length > 0 ? row.mvt : null;
}

/**
 * A pre-rendered tile, gzipped, or null when this one is cut on request. One rendered by another
 * tiling version, before a bump or by a worker still on the old code, is cut on request instead
 * (docs/adr/0043).
 */
export async function findPrerenderedTile(entityManager: EntityManager, run: string, tile: TileAddress): Promise<Buffer | null> {
  const [row]: { data: Buffer }[] = await entityManager.query(
    `SELECT data FROM "${process.env.POSTGRES_SCHEMA}"."soil_index_tiles" WHERE run = $1 AND z = $2 AND x = $3 AND y = $4 AND version = $5`,
    [run, tile.z, tile.x, tile.y, TILING_VERSION],
  );
  return row?.data ?? null;
}

export const gzipTile = (mvt: Buffer): Promise<Buffer> => gzipAsync(mvt);
export const gunzipTile = (data: Buffer): Promise<Buffer> => gunzipAsync(data);

/** Postgres' undefined_table: a Run's partition dropped by a DELETE while it was being read. */
export const isUndefinedTable = (error: unknown): boolean => (error as { code?: string })?.code === '42P01';

/**
 * Renders every tile of the Run holding more than `minVertices`, lowest zooms first, at most
 * `maxTiles` of them, into the Run's `soil_index_tiles` partition. The partition is filled
 * standalone and then attached, so an attached one means pre-rendering is done; a Run with nothing
 * to pre-render still gets an empty one.
 *
 * Rendering holds no transaction, so a DELETE of the Run never waits on it, and attaching locks the
 * Run's record first: if a DELETE got there before, `destroyed` is set and nothing is left behind
 * (docs/adr/0044).
 */
export async function prerenderSoilIndexTiles(
  entityManager: EntityManager,
  run: string,
  { minVertices, maxTiles }: { minVertices: number; maxTiles: number },
): Promise<{ rendered: number; capped: boolean; destroyed: boolean }> {
  if (!validate(run)) {
    throw new Error(`Refusing to pre-render tiles for a non-uuid run: ${run}`);
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const partition = `"${schema}"."${soilIndexTilesPartition(run)}"`;
  const parent = `"${schema}"."soil_index_tiles"`;
  const destroyed = { rendered: 0, capped: false, destroyed: true };

  // Read past the cache: it may still hold a Run destroyed since.
  const tiling = await readSoilIndexTiling(entityManager, run);
  if (!tiling) {
    return destroyed;
  }

  let rendered = 0;
  let capped = false;
  try {
    const candidates: TileAddress[] =
      tiling.detailZoom === null
        ? []
        : await entityManager.query(`SELECT z, x, y FROM (${tileVerticesSql(run)}) tiles WHERE vertices > $1 ORDER BY z, x, y LIMIT $2`, [
            minVertices,
            maxTiles + 1,
          ]);
    capped = candidates.length > maxTiles;

    await entityManager.query(`DROP TABLE IF EXISTS ${partition}`);
    await entityManager.query(`CREATE TABLE ${partition} (LIKE ${parent} INCLUDING DEFAULTS)`);
    await entityManager.query(
      `ALTER TABLE ${partition} ADD CONSTRAINT "chk_${soilIndexTilesPartition(run)}_run" CHECK ("run" = '${run}'::uuid)`,
    );
    for (const tile of candidates.slice(0, maxTiles)) {
      const mvt = await renderTile(entityManager, run, tiling.detailZoom!, tile);
      if (!mvt) {
        continue;
      }
      await entityManager.query(`INSERT INTO ${partition} ("run", "z", "x", "y", "version", "data") VALUES ($1, $2, $3, $4, $5, $6)`, [
        run,
        tile.z,
        tile.x,
        tile.y,
        TILING_VERSION,
        await gzipTile(mvt),
      ]);
      rendered += 1;
    }

    const attached = await entityManager.transaction(async transactionalEntityManager => {
      const [record] = await transactionalEntityManager.query(`SELECT 1 FROM "${schema}"."soil_index_runs" WHERE run = $1 FOR SHARE`, [
        run,
      ]);
      if (!record) {
        return false;
      }
      await transactionalEntityManager.query(`ALTER TABLE ${parent} ATTACH PARTITION ${partition} FOR VALUES IN ('${run}'::uuid)`);
      return true;
    });
    if (!attached) {
      await entityManager.query(`DROP TABLE IF EXISTS ${partition}`);
      return destroyed;
    }
  } catch (error) {
    // The DELETE dropped the scores, or the half-filled tiles, from under us.
    if (isUndefinedTable(error)) {
      await entityManager.query(`DROP TABLE IF EXISTS ${partition}`);
      return destroyed;
    }
    throw error;
  }

  return { rendered, capped, destroyed: false };
}

export interface SoilIndexScore {
  id: number;
  value: number;
  year?: number;
  metadata: Record<string, unknown>;
}

/** One Scored Geometry's value, year and metadata, or null when the Run or the id is unknown. */
export async function getSoilIndexScore(entityManager: EntityManager, run: string, id: number): Promise<SoilIndexScore | null> {
  if (!validate(run)) {
    return null;
  }
  const [row]: { id: number; value: number; year: number | null; metadata: Record<string, unknown> }[] = await entityManager.query(
    `SELECT id, value, year, metadata FROM "${process.env.POSTGRES_SCHEMA}"."soil_index" WHERE run = $1 AND id = $2`,
    [run, id],
  );
  if (!row) {
    return null;
  }
  // Absent rather than null, as everywhere a value is missing (docs/adr/0021).
  return { id: row.id, value: Number(row.value), ...(row.year === null ? {} : { year: row.year }), metadata: row.metadata };
}
