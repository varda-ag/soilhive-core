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
 * The chain is: aoi_raw → clipped raster CTEs → mask CTEs → aoi.
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
      const clippedRaster = `clipped_${table}`;
      const maskCte = `mask_${baseTable}`;

      ctes.push({
        name: clippedRaster,
        sql: `SELECT ST_Union(ST_Clip(rr.rast, aoi_raw.geom, touched => TRUE)) AS rast
              FROM ${schema}.${table} rr
              CROSS JOIN aoi_raw
              WHERE ST_Intersects(rr.rast, aoi_raw.geom)`,
        materialized: true,
      });

      ctes.push({
        name: maskCte,
        sql: `SELECT ST_Union(dp.geom) AS geom
              FROM ${clippedRaster}
              CROSS JOIN LATERAL ST_DumpAsPolygons(${clippedRaster}.rast) dp
              WHERE dp.val = ANY(ARRAY[${values.join(',')}]::double precision[])`,
        materialized: true,
      });

      maskCteNames.push(maskCte);
    }
  }

  const resultExpr = maskCteNames.reduce((acc, m) => `ST_Intersection(${acc}, ${m}.geom)`, 'aoi_raw.geom');
  const fromTables = ['aoi_raw', ...maskCteNames].join(', ');
  const whereClause = maskCteNames.length > 0 ? `WHERE ${maskCteNames.map(m => `${m}.geom IS NOT NULL`).join(' AND ')}` : '';

  // aoi_raw holds subdivision pieces (one row each), so the masked intersections are
  // aggregated back into a single row: consumers treat aoi as one geometry (scalar
  // subqueries, GeoJSON output). The union is bounded by the mask extent, not the
  // full user geometry.
  ctes.push({
    name: 'aoi',
    sql: `SELECT ST_Multi(ST_CollectionExtract(ST_Union(ST_MakeValid(${resultExpr}, 'method=structure')), 3)) AS geom
          FROM ${fromTables}
          ${whereClause}`,
    materialized: true,
  });

  return ctes;
};
