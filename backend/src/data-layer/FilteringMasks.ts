import { EntityManager } from 'typeorm';
import { selectOverviewTable } from '../utils/raster';
import { DataFilter } from '../interfaces/DatasetFilter';
import { getEnabledRasterFilterTables } from './SoilDataStorage';

export type CteDef = { name: string; sql: string; materialized?: boolean };

/** The body of a raw-SQL `WITH`, binding `:geometryIds` to the placeholder `geometryIdsParam`. */
export const renderCtes = (ctes: CteDef[], geometryIdsParam: string): string =>
  ctes
    .map(cte => `${cte.name}${cte.materialized ? ' AS MATERIALIZED' : ''} (${cte.sql.replace(/:geometryIds/g, geometryIdsParam)})`)
    .join(',\n      ');

/**
 * Returns a chain of CTEs that resolves to an `aoi` CTE containing the vector mask
 * geometry (user geometry intersected with any active raster filter values).
 * The chain is: aoi_raw → clipped raster CTEs → mask CTEs (one row per pixel region) → aoi.
 * Pass the returned array to the query builder via addCommonTableExpression, then
 * setParameter('geometryIds', ...) to bind the UUIDs.
 *
 * aoiRawSeed overrides the default subdivision-based aoi_raw CTE with a caller
 * geometry source (its `name` is forced to 'aoi_raw' — the rest of the chain
 * references it by that name). Used by the DAI fast path, whose AOI is the
 * viewport intersection rather than a stored user geometry.
 */
export const getVectorMaskCtes = async (entityManager: EntityManager, filter: DataFilter, aoiRawSeed?: CteDef): Promise<CteDef[]> => {
  const { parameters: filters, area: aoiAreaM2 } = filter;
  const schema = process.env.POSTGRES_SCHEMA;
  const enabledRasterFilterTables = await getEnabledRasterFilterTables(entityManager);
  const raster_filters = filters.raster_filters;
  const ctes: CteDef[] = [];
  const maskCteNames: string[] = [];

  ctes.push(
    aoiRawSeed
      ? { ...aoiRawSeed, name: 'aoi_raw' }
      : {
          name: 'aoi_raw',
          sql: `SELECT ugs.geom
          FROM ${schema}.user_geometry_subdivisions ugs WHERE ugs.user_geometry_id = ANY(:geometryIds::uuid[])`,
          materialized: true,
        },
  );

  if (raster_filters) {
    for (const { id: baseTable, resolutionM } of enabledRasterFilterTables) {
      const values = raster_filters[baseTable];
      if (!values || values.length === 0) continue;

      const table = selectOverviewTable(baseTable, aoiAreaM2, resolutionM);
      // Numbered, not named after the table: clipped_o_32_<id> can pass Postgres' 63 characters, and
      // two ids truncated to the same name would clash. mask_<id> always fits.
      const clippedRaster = `clipped_${maskCteNames.length}`;
      const maskCte = `mask_${baseTable}`;

      ctes.push({
        name: clippedRaster,
        sql: `SELECT ST_Union(ST_Clip(rr.rast, aoi_raw.geom, touched => TRUE)) AS rast
              FROM ${schema}.${table} rr
              CROSS JOIN aoi_raw
              WHERE ST_Intersects(rr.rast, aoi_raw.geom)`,
        materialized: true,
      });

      // One row per connected region of selected pixels. Reclassing every selected value to 1 (the rest
      // to nodata) first merges adjacent selected classes, so regions never share an edge.
      const reclassExpr = values.map(v => `${Number(v)}:1`).join(',');
      ctes.push({
        name: maskCte,
        sql: `SELECT dp.geom
              FROM ${clippedRaster}
              CROSS JOIN LATERAL ST_DumpAsPolygons(ST_Reclass(${clippedRaster}.rast, 1, '${reclassExpr}', '8BUI', 0)) dp`,
        materialized: true,
      });

      maskCteNames.push(maskCte);
    }
  }

  // Consumers treat aoi as one geometry (scalar subqueries, GeoJSON output), so it is one row.
  if (maskCteNames.length === 0) {
    ctes.push({
      name: 'aoi',
      sql: `SELECT ST_Multi(ST_CollectionExtract(ST_Union(ST_MakeValid(aoi_raw.geom, 'method=structure')), 3)) AS geom
            FROM aoi_raw`,
      materialized: true,
    });
    return ctes;
  }

  // Region by region rather than one overlay of the AOI with the whole mask: a region inside an AOI
  // piece is kept whole, one crossing a piece edge is cut by the pieces it meets. Regions only touch
  // at points, so ST_Collect gives a valid MultiPolygon without a union.
  const [firstMask, ...otherMasks] = maskCteNames;
  const firstMaskInAoi = `ST_CollectionExtract(ST_Collect(
            CASE WHEN EXISTS (SELECT 1 FROM aoi_raw p WHERE ST_Covers(p.geom, m.geom)) THEN m.geom
            ELSE (SELECT ST_Union(ST_MakeValid(ST_Intersection(p.geom, m.geom), 'method=structure'))
                  FROM aoi_raw p WHERE p.geom && m.geom)
            END), 3)`;
  // Further masks are on other pixel grids, so they still take a full overlay
  const resultExpr = otherMasks.reduce(
    (acc, m) =>
      `ST_CollectionExtract(ST_MakeValid(ST_Intersection(${acc}, (SELECT ST_CollectionExtract(ST_Collect(geom), 3) FROM ${m})), 'method=structure'), 3)`,
    firstMaskInAoi,
  );

  ctes.push({
    name: 'aoi',
    sql: `SELECT ST_Multi(${resultExpr}) AS geom
          FROM ${firstMask} m`,
    materialized: true,
  });

  return ctes;
};
