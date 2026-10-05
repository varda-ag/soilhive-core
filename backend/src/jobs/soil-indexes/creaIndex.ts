import { SoilIndexJob } from '../../interfaces/Job';
import { SoilIndexFeature } from './types';
import { RunContext } from '../runs/runContext';
import { getSoilIndexMockScores } from '../../utils/utils';

const FIRST_YEAR = 2015;
const YEARS = 10;

/** A non-negative 30-bit hash of the SQL text expression `key`, stable across Runs. */
const hashSql = (key: string): string => `(hashtext(${key}) & 1073741823)`;

/**
 * The `crea-index` Soil Index Type. MOCK, not the CREA index: getSoilIndexMockScores() points
 * (50,000 by default), whatever the size of the area, spread evenly over the Run's
 * Aggregation Units, each with a value in [0, 1) and a year from FIRST_YEAR on.
 *
 * Points are generated per subdivision piece (docs/adr/0006), each piece's share in proportion to
 * its area and the shares rounded by largest remainder so they total exactly that: a piece
 * has at most 64 vertices, where a unit may have millions. Positions, values and years are seeded
 * by unit and piece, so the same area always gets the same mock. Overlapping units each score
 * their overlap.
 */
export async function runCreaIndex(ctx: RunContext, _data: SoilIndexJob): Promise<SoilIndexFeature[]> {
  const { entityManager, unitIds, report, assertNotCancelled } = ctx;

  await report(`Scoring ${unitIds.length} area(s)...`, 40);
  const pieceKey = `unit_id::text || ':' || piece_id::text`;
  const pointKey = `${pieceKey} || ':' || (point).path[1]`;
  const rows: { unit_id: string; lon: number; lat: number; value: number; year: number }[] = await entityManager.query(
    `WITH pieces AS (
       SELECT piece.user_geometry_id AS unit_id, piece.id AS piece_id, piece.geom, ST_Area(piece.geom::geography) AS area
       FROM ${process.env.POSTGRES_SCHEMA}.user_geometry_subdivisions piece
       WHERE piece.user_geometry_id = ANY($1::uuid[])
     ), quotas AS (
       SELECT unit_id, piece_id, geom, $2::int * area / NULLIF(sum(area) OVER (), 0) AS exact
       FROM pieces
     ), allocated AS (
       SELECT unit_id, piece_id, geom,
              floor(exact)::int
              + CASE WHEN row_number() OVER (ORDER BY exact - floor(exact) DESC, unit_id, piece_id)
                          <= $2::int - sum(floor(exact)) OVER () THEN 1 ELSE 0 END AS n
       FROM quotas
       WHERE exact IS NOT NULL
     ), generated AS (
       SELECT unit_id, piece_id, ST_Dump(ST_GeneratePoints(geom, n, ${hashSql(pieceKey)} + 1)) AS point
       FROM allocated
       WHERE n > 0
     )
     SELECT unit_id,
            round(ST_X((point).geom)::numeric, 6)::float8 AS lon,
            round(ST_Y((point).geom)::numeric, 6)::float8 AS lat,
            (floor(${hashSql(`${pointKey} || ':value'`)} / 1073741824.0 * 1000) / 1000)::float8 AS value,
            ${FIRST_YEAR} + ${hashSql(`${pointKey} || ':year'`)} % ${YEARS} AS year
     FROM generated
     ORDER BY unit_id, piece_id, (point).path[1]`,
    [unitIds, getSoilIndexMockScores()],
  );

  await assertNotCancelled();

  return rows.map(row => ({
    type: 'Feature' as const,
    id: row.unit_id,
    geometry: { type: 'Point' as const, coordinates: [row.lon, row.lat] },
    properties: { value: row.value, year: row.year },
  }));
}
