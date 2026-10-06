import { EntityManager } from 'typeorm';
import { validate } from 'uuid';
import { SoilIndexType } from '../types/enums';
import { SoilIndexFeature } from '../jobs/soil-indexes/types';
import { getTilesAggregationMaxVertices } from '../utils/utils';

/**
 * One partition per Run, named from the Run's uuid with the hyphens replaced by underscores:
 * 47 characters, and 55 for the CHECK constraint derived from it below, both comfortably inside
 * Postgres' 63-byte identifier limit.
 */
export const soilIndexPartition = (run: string): string => `soil_index_${run.toLowerCase().replace(/-/g, '_')}`;

/** The Run's pre-rendered tiles partition: 53 characters, inside Postgres' 63-byte identifier limit. */
export const soilIndexTilesPartition = (run: string): string => `soil_index_tiles_${run.toLowerCase().replace(/-/g, '_')}`;

/** Highest zoom Soil Index tiles are cut at; MapLibre overzooms above it. */
export const TILE_MAX_ZOOM = 16;

/** Web Mercator's latitude limit, north and south. */
export const MERCATOR_MAX_LATITUDE = 85.0511287798066;

/**
 * Tile column holding `point` at `zoom` (both SQL expressions), in the scheme ST_TileEnvelope
 * uses. With `tileRowSql`, the one definition of which tile a Scored Geometry falls in, shared by
 * the budgets and the cells so the two never disagree.
 */
export const tileColumnSql = (point: string, zoom: string): string =>
  `LEAST(GREATEST(floor((ST_X(${point}) + 180) / 360 * 2 ^ (${zoom})), 0), 2 ^ (${zoom}) - 1)::int`;

/** Tile row holding `point` at `zoom`. Latitudes beyond Web Mercator's land on the edge rows. */
export const tileRowSql = (point: string, zoom: string): string => {
  const latitude = `radians(LEAST(GREATEST(ST_Y(${point}), -${MERCATOR_MAX_LATITUDE}), ${MERCATOR_MAX_LATITUDE}))`;
  return `LEAST(GREATEST(floor((1 - asinh(tan(${latitude})) / pi()) / 2 * 2 ^ (${zoom})), 0), 2 ^ (${zoom}) - 1)::int`;
};

/**
 * A Run's Scored Geometries as tiling reads them: with the vertices both tile budgets spend, and
 * the representative point that places each in exactly one tile. The only place tiling reads
 * geometries from, so subdividing them later (docs/adr/0043) changes nothing else. `run` is
 * interpolated, so callers must have validated it.
 */
export const scoredGeometriesSql = (run: string): string =>
  `(SELECT id, value, year, geometry, ST_NPoints(geometry) AS vertices, ST_PointOnSurface(geometry) AS point
    FROM "${process.env.POSTGRES_SCHEMA}"."${soilIndexPartition(run)}")`;

/** Vertices in every non-empty tile at every zoom up to TILE_MAX_ZOOM, from one scan of the Run. */
export const tileVerticesSql = (run: string): string =>
  `WITH placed AS (
     SELECT vertices,
            ${tileColumnSql('point', String(TILE_MAX_ZOOM))} AS x,
            ${tileRowSql('point', String(TILE_MAX_ZOOM))} AS y
     FROM ${scoredGeometriesSql(run)} scored
   )
   SELECT z, x >> (${TILE_MAX_ZOOM} - z) AS x, y >> (${TILE_MAX_ZOOM} - z) AS y, sum(vertices)::bigint AS vertices
   FROM placed CROSS JOIN generate_series(0, ${TILE_MAX_ZOOM}) AS z
   GROUP BY z, placed.x >> (${TILE_MAX_ZOOM} - z), placed.y >> (${TILE_MAX_ZOOM} - z)`;

/**
 * The first zoom at which no tile holds more than `maxVertices`: from there on tiles carry the
 * Scored Geometries themselves, below it grid cells. A tile at zoom z + 1 is a quarter of one at
 * z, so the first zoom that fits is the cut-over. Past TILE_MAX_ZOOM when even the last zoom does
 * not fit, so the Run is shown as cells throughout; null when it scored nothing.
 */
export async function detailZoomOf(entityManager: EntityManager, run: string, maxVertices: number): Promise<number | null> {
  const rows: { z: number; vertices: string }[] = await entityManager.query(
    `SELECT z, max(vertices) AS vertices FROM (${tileVerticesSql(run)}) tiles GROUP BY z ORDER BY z`,
  );
  if (!rows.length) {
    return null;
  }
  const fits = rows.find(row => Number(row.vertices) <= maxVertices);
  return fits ? fits.z : TILE_MAX_ZOOM + 1;
}

/** Thrown inside writeSoilIndexRun's transaction to roll it back for a cancelled Run. */
class RunNotLive extends Error {}

/**
 * Writes one Run's scored geometries into `soil_index` as its own LIST partition.
 *
 * The partition is built standalone, filled, indexed, and only then ATTACHed.
 * Create, load and attach run in one transaction, so a Run is either fully attached or absent.
 * An empty Run still gets an empty partition.
 *
 * `soilIndexType` is stored on every row rather than inferred from the Run, because a Run's
 * pg-boss record is deleted on retention while its partition is permanent: without the column, an
 * old score would be a number with no methodology attached (ADR 0036).
 *
 * The Run's completed `soil_index_runs` record is written in the same transaction, so the Run is
 * complete, readable and tileable all at once (docs/adr/0043, 0044).
 *
 * `assertLive` runs first inside that transaction. Returning false rolls everything back and
 * resolves null: that is how a Run cancelled by a DELETE avoids writing scores for a record the
 * DELETE has already destroyed.
 */
export async function writeSoilIndexRun(
  entityManager: EntityManager,
  run: string,
  soilIndexType: SoilIndexType,
  features: SoilIndexFeature[],
  options: { request?: object; createdAt?: Date; assertLive?: (transactionalEntityManager: EntityManager) => Promise<boolean> } = {},
): Promise<number | null> {
  // `run` reaches the DDL below by string interpolation, so validate it first to avoid SQL injection.
  if (!validate(run)) {
    throw new Error(`Refusing to build a soil_index partition for a non-uuid run: ${run}`);
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const partition = `"${schema}"."${soilIndexPartition(run)}"`;
  const parent = `"${schema}"."soil_index"`;

  // A retry rebuilds the Run whole, tiles included.
  await entityManager.query(`DROP TABLE IF EXISTS ${partition}`);
  await entityManager.query(`DROP TABLE IF EXISTS "${schema}"."${soilIndexTilesPartition(run)}"`);
  await entityManager.query(`DELETE FROM "${schema}"."soil_index_runs" WHERE "run" = $1`, [run]);

  // `metadata` carries the unit_id because nothing else does. Ids number the scores within the
  // Run, in the order the methodology produced them.
  const rows = features.map((feature, index) => ({
    id: index + 1,
    geom: feature.geometry,
    val: feature.properties.value,
    meta: { unit_id: feature.id },
    yr: feature.properties.year ?? null,
  }));

  try {
    await entityManager.transaction(async transactionalEntityManager => {
      if (options.assertLive && !(await options.assertLive(transactionalEntityManager))) {
        throw new RunNotLive();
      }
      await transactionalEntityManager.query(`CREATE TABLE ${partition} (LIKE ${parent} INCLUDING DEFAULTS)`);
      await transactionalEntityManager.query(
        `ALTER TABLE ${partition} ADD CONSTRAINT "chk_${soilIndexPartition(run)}_run" CHECK ("run" = '${run}'::uuid)`,
      );

      await transactionalEntityManager.query(
        `INSERT INTO ${partition} ("run", "id", "soil_index_type", "geometry", "value", "metadata", "year")
       SELECT $1::uuid, source.id, $2::text, ST_SetSRID(ST_GeomFromGeoJSON(source.geom), 4326), source.val, source.meta, source.yr
       FROM jsonb_to_recordset($3::jsonb) AS source(id integer, geom jsonb, val double precision, meta jsonb, yr smallint)`,
        [run, soilIndexType, JSON.stringify(rows)],
      );

      await transactionalEntityManager.query(`CREATE INDEX ON ${partition} USING GIST ("geometry")`);

      // Add statistics to the partition.
      // ANALYZE is allowed inside a transaction block, unlike VACUUM.
      await transactionalEntityManager.query(`ANALYZE ${partition}`);

      const detailZoom = await detailZoomOf(transactionalEntityManager, run, getTilesAggregationMaxVertices());
      await transactionalEntityManager.query(
        `INSERT INTO "${schema}"."soil_index_runs"
         ("run", "status", "request", "message", "created_at", "completed_at", "score_count", "bounds", "detail_zoom")
       SELECT $1::uuid, 'completed', $2::jsonb, NULL, $3::timestamptz, now(), $4::integer,
              CASE WHEN extent.box IS NOT NULL
                THEN ST_MakeEnvelope(ST_XMin(extent.box), ST_YMin(extent.box), ST_XMax(extent.box), ST_YMax(extent.box), 4326)
              END,
              $5::smallint
       FROM (SELECT ST_Extent("geometry") AS box FROM ${partition}) extent`,
        [
          run,
          JSON.stringify(options.request ?? { soil_index_type: soilIndexType }),
          options.createdAt ?? new Date(),
          rows.length,
          detailZoom,
        ],
      );

      await transactionalEntityManager.query(`ALTER TABLE ${parent} ATTACH PARTITION ${partition} FOR VALUES IN ('${run}'::uuid)`);
    });
  } catch (error) {
    if (error instanceof RunNotLive) {
      return null;
    }
    throw error;
  }

  return rows.length;
}

/** A Run is complete once its partition is attached; the job is not consulted, as it expires. */
export async function soilIndexRunExists(entityManager: EntityManager, run: string): Promise<boolean> {
  if (!validate(run)) {
    return false;
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const [row]: { attached: boolean }[] = await entityManager.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_inherits
       WHERE inhparent = to_regclass($1) AND inhrelid = to_regclass($2)
     ) AS attached`,
    [`"${schema}"."soil_index"`, `"${schema}"."${soilIndexPartition(run)}"`],
  );
  return Boolean(row?.attached);
}

/** Null when the Run scored nothing. */
export async function soilIndexRunType(entityManager: EntityManager, run: string): Promise<SoilIndexType | null> {
  const schema = process.env.POSTGRES_SCHEMA;
  const [row]: { soil_index_type: SoilIndexType }[] = await entityManager.query(
    `SELECT soil_index_type FROM "${schema}"."soil_index" WHERE run = $1::uuid LIMIT 1`,
    [run],
  );
  return row?.soil_index_type ?? null;
}
