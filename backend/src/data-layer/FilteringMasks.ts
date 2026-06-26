import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as turf from '@turf/turf';
import { MultiPolygon, Polygon } from 'geojson';
import { EntityManager } from 'typeorm';
import { selectOverviewTable, getOverviewPixelSizeM } from '../utils/raster';
import { geometryUnion } from '../utils/geometry';
import { DataFilter } from '../interfaces/DatasetFilter';
import { getEnabledRasterFilterTables } from './SoilDataStorage';
import { getDateTimeString } from '../jobs/soil-export/storageHelpers';

const RASTER_MASK_RESOLUTION = 1024.0;
const BASE_OVERVIEW_PIXEL_SIZE_M = 100;

const calcEffectiveResolution = (geomUnion: Polygon | MultiPolygon, overviewPixelSizeM: number): number => {
  const [minX, minY, maxX, maxY] = turf.bbox(geomUnion);
  const midLatRad = ((minY + maxY) / 2) * (Math.PI / 180);
  const widthM = (maxX - minX) * 111320 * Math.cos(midLatRad);
  const heightM = (maxY - minY) * 110540;
  const naturalResolution = Math.ceil(Math.max(widthM, heightM) / overviewPixelSizeM);
  return Math.min(RASTER_MASK_RESOLUTION, naturalResolution);
};

const hasMatchingRasterValues = async (
  entityManager: EntityManager,
  filter: DataFilter,
  geomUnion: Polygon | MultiPolygon,
): Promise<boolean> => {
  const enabledRasterFilterTables = await getEnabledRasterFilterTables();
  const raster_filters = filter.parameters.raster_filters;
  if (!raster_filters) return true;

  const schema = process.env.POSTGRES_SCHEMA;
  const aoiAreaM2 = filter.area;
  const geomJson = JSON.stringify(geomUnion);

  for (const baseTable of enabledRasterFilterTables) {
    const values = raster_filters[baseTable];
    if (!values || values.length === 0) continue;

    const table = selectOverviewTable(baseTable, aoiAreaM2);

    const bboxCheck = await entityManager.query(
      `SELECT EXISTS (
        SELECT 1 FROM ${schema}.${table} rr
        WHERE rr.rast && ST_GeomFromGeoJSON($1)::geometry
      ) AS has_tiles`,
      [geomJson],
    );
    if (!bboxCheck[0].has_tiles) return false;

    const valueCheck = await entityManager.query(
      `SELECT EXISTS (
        SELECT 1
        FROM ${schema}.${table} rr
        CROSS JOIN LATERAL unnest(ST_DumpValues(rr.rast, 1)) v(val)
        WHERE rr.rast && ST_GeomFromGeoJSON($1)::geometry
          AND v.val = ANY(ARRAY[${values.join(',')}]::double precision[])
        LIMIT 1
      ) AS has_values`,
      [geomJson],
    );
    if (!valueCheck[0].has_values) return false;
  }

  return true;
};

export type CteDef = { name: string; sql: string; materialized?: boolean };

/**
 * Returns a chain of CTEs that resolves to an `aoi` CTE containing the vector mask
 * geometry (user geometry intersected with any active raster filter values).
 * The chain is: aoi_raw → clipped raster CTEs → mask CTEs → aoi.
 * Pass the returned array to the query builder via addCommonTableExpression, then
 * setParameter('geometryIds', ...) to bind the UUIDs.
 */
export const getVectorMaskCtes = async (entityManager: EntityManager, filter: DataFilter): Promise<CteDef[]> => {
  const { parameters: filters, area: aoiAreaM2 } = filter;
  const schema = process.env.POSTGRES_SCHEMA;
  const enabledRasterFilterTables = await getEnabledRasterFilterTables();
  const raster_filters = filters.raster_filters;
  const ctes: CteDef[] = [];
  const maskCteNames: string[] = [];

  ctes.push({
    name: 'aoi_raw',
    sql: `SELECT ugs.geom
          FROM ${schema}.user_geometry_subdivisions ugs WHERE ugs.user_geometry_id = ANY(:geometryIds::uuid[])`,
    materialized: true,
  });

  if (raster_filters) {
    for (const baseTable of enabledRasterFilterTables) {
      const values = raster_filters[baseTable];
      if (!values || values.length === 0) continue;

      const table = selectOverviewTable(baseTable, aoiAreaM2);
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

export const getVectorMask = async (entityManager: EntityManager, filter: DataFilter): Promise<Polygon | MultiPolygon> => {
  const ctes = await getVectorMaskCtes(entityManager, filter);
  const cteStrings = ctes.map(
    cte => `${cte.name}${cte.materialized ? ' AS MATERIALIZED' : ''} (${cte.sql.replace(/:geometryIds/g, '$1')})`,
  );
  const [row] = await entityManager.query(`WITH ${cteStrings.join(',\n')} SELECT ST_AsGeoJSON(geom)::json AS geom FROM aoi`, [
    filter.geometryIds,
  ]);
  return row.geom;
};

export const getRasterMask = async (
  entityManager: EntityManager,
  filter: DataFilter,
  output: 'file' | 'table', // It is caller responsability to drop the temp table after use (if output is 'table') or delete temp file (if output is 'file')
  rasterize: boolean = true, // If true, will rasterize the AOI and apply raster filters in a single step; if false, will create a vector mask and then rasterize it
): Promise<string | undefined> => {
  if (filter.geometryIds.length === 0) {
    return undefined;
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const rows: { geom: Polygon | MultiPolygon }[] = await entityManager.query(
    `SELECT ST_AsGeoJSON(ug.geom)::json AS geom FROM ${schema}.user_geometries ug WHERE ug.id = ANY($1::uuid[])`,
    [filter.geometryIds],
  );
  const geomUnion = geometryUnion(rows.map(r => r.geom));
  const hasValues = await hasMatchingRasterValues(entityManager, filter, geomUnion);

  // When raster filter values don't match any pixels in the AOI, fall back to
  // the AOI-only mask so the caller still receives geographic clipping.
  let effectiveFilter = filter;
  if (!hasValues) {
    const { raster_filters: _rf, ...parametersWithoutFilters } = filter.parameters;
    effectiveFilter = { ...filter, parameters: parametersWithoutFilters };
  }

  const enabledRasterFilterTables = await getEnabledRasterFilterTables();

  let ctes: string[];
  let params: any[];

  if (rasterize) {
    ({ ctes, params } = buildRasterizeCtes(effectiveFilter, geomUnion, enabledRasterFilterTables));
  } else {
    const built = buildVectorMaskCtes(effectiveFilter, enabledRasterFilterTables);
    ctes = built.ctes;
    params = built.params;

    ctes.push(`vector_mask AS MATERIALIZED (
      SELECT ST_Union(${built.resultExpr}) AS geom
      FROM ${built.fromTables}
      ${built.whereClause}
    )`);

    ctes.push(`bbox AS MATERIALIZED (
      SELECT
        ST_XMin(ST_Extent(aoi.geom)) AS min_x,
        ST_YMin(ST_Extent(aoi.geom)) AS min_y,
        ST_XMax(ST_Extent(aoi.geom)) AS max_x,
        ST_YMax(ST_Extent(aoi.geom)) AS max_y
      FROM aoi
    )`);

    const raster_filters = effectiveFilter.parameters.raster_filters;
    const hasActiveFiltersNR = raster_filters != null && enabledRasterFilterTables.some(t => (raster_filters[t]?.length ?? 0) > 0);
    const overviewPixelSizeMNR = hasActiveFiltersNR
      ? getOverviewPixelSizeM(filter.area, RASTER_MASK_RESOLUTION)
      : BASE_OVERVIEW_PIXEL_SIZE_M;
    const effectiveResolutionNR = calcEffectiveResolution(geomUnion, overviewPixelSizeMNR);

    ctes.push(`raster_params AS (
      SELECT
        min_x, min_y, max_x, max_y,
        GREATEST(max_x - min_x, max_y - min_y) / ${effectiveResolutionNR} AS pixel_size,
        CEIL((max_x - min_x) / (GREATEST(max_x - min_x, max_y - min_y) / ${effectiveResolutionNR}))::int AS raster_width,
        CEIL((max_y - min_y) / (GREATEST(max_x - min_x, max_y - min_y) / ${effectiveResolutionNR}))::int AS raster_height
      FROM bbox
    )`);

    ctes.push(`ref_raster AS MATERIALIZED (
      SELECT
        ST_MakeEmptyRaster(raster_width, raster_height, min_x, max_y, pixel_size, -pixel_size, 0, 0, 4326) AS rast,
        raster_width AS width,
        raster_height AS height,
        pixel_size,
        min_x, min_y, max_x, max_y
      FROM raster_params
    )`);

    ctes.push(`rasterized AS MATERIALIZED (
      SELECT
        COALESCE(
          ST_AsRaster(vm.geom, ref.rast, '1BB', 1::float8, NULL::float8),
          ST_AddBand(ref.rast, '1BB'::text, 0::float8, NULL::float8)
        ) AS rast,
        ref.width, ref.height, ref.pixel_size,
        ref.min_x, ref.min_y, ref.max_x, ref.max_y
      FROM ref_raster ref
      LEFT JOIN vector_mask vm ON true
    )`);
  }

  await entityManager.query("SET LOCAL work_mem = '256MB';");

  const dateTimeString = getDateTimeString();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const tableName = `mask_${dateTimeString}_${randomSuffix}`;

  if (output === 'table') {
    await entityManager.query(
      `CREATE TEMP TABLE "${tableName}" AS
        WITH ${ctes.join(',\n        ')}
        SELECT rast, width, height, pixel_size, min_x, min_y, max_x, max_y FROM rasterized`,
      params,
    );
    return tableName;
  }

  // output === 'file'
  const sql = `
      WITH ${ctes.join(',\n      ')}
      SELECT ST_AsGDALRaster(r.rast, 'GTiff') AS raster_data
      FROM rasterized r
    `;
  const results = await entityManager.query(sql, params);
  if (results.length === 0 || results[0].raster_data === null) {
    return undefined;
  }
  const rasterBuffer: Buffer = results[0].raster_data;
  const tempDir = path.join(os.tmpdir(), 'raster-masks');
  fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `${tableName}.tif`);
  fs.writeFileSync(filePath, rasterBuffer);
  return filePath;
};

const buildRasterizeCtes = (
  filter: DataFilter,
  geomUnion: Polygon | MultiPolygon,
  enabledRasterFilterTables: string[],
): { ctes: string[]; params: any[] } => {
  const schema = process.env.POSTGRES_SCHEMA;
  const params: any[] = [];
  const p = (val: any) => {
    params.push(val);
    return `$${params.length}`;
  };

  const aoiAreaM2 = filter.area;
  const geomParam = p(JSON.stringify(geomUnion));
  const raster_filters = filter.parameters.raster_filters;
  const ctes: string[] = [];

  const hasActiveFilters = raster_filters != null && enabledRasterFilterTables.some(t => (raster_filters[t]?.length ?? 0) > 0);
  const overviewPixelSizeM = hasActiveFilters ? getOverviewPixelSizeM(aoiAreaM2, RASTER_MASK_RESOLUTION) : BASE_OVERVIEW_PIXEL_SIZE_M;
  const effectiveResolution = calcEffectiveResolution(geomUnion, overviewPixelSizeM);

  ctes.push(`aoi AS MATERIALIZED (
      SELECT ST_CollectionExtract(ST_MakeValid(ST_GeomFromGeoJSON(${geomParam}), 'method=structure'), 3) AS geom
    )`);

  ctes.push(`bbox AS MATERIALIZED (
      SELECT
        ST_XMin(ST_Envelope(aoi.geom)) AS min_x,
        ST_YMin(ST_Envelope(aoi.geom)) AS min_y,
        ST_XMax(ST_Envelope(aoi.geom)) AS max_x,
        ST_YMax(ST_Envelope(aoi.geom)) AS max_y
      FROM aoi
    )`);

  ctes.push(`raster_params AS (
      SELECT
        min_x, min_y, max_x, max_y,
        GREATEST(max_x - min_x, max_y - min_y) / ${effectiveResolution} AS pixel_size,
        CEIL((max_x - min_x) / (GREATEST(max_x - min_x, max_y - min_y) / ${effectiveResolution}))::int AS raster_width,
        CEIL((max_y - min_y) / (GREATEST(max_x - min_x, max_y - min_y) / ${effectiveResolution}))::int AS raster_height
      FROM bbox
    )`);

  ctes.push(`ref_raster AS MATERIALIZED (
      SELECT
        ST_MakeEmptyRaster(raster_width, raster_height, min_x, max_y, pixel_size, -pixel_size, 0, 0, 4326) AS rast,
        raster_width AS width,
        raster_height AS height,
        pixel_size,
        min_x, min_y, max_x, max_y
      FROM raster_params
    )`);

  ctes.push(`rasterized_aoi AS MATERIALIZED (
      SELECT
        COALESCE(
          ST_AsRaster(aoi.geom, ref.rast, '1BB', 1::float8, NULL::float8),
          ST_AddBand(ref.rast, '1BB'::text, 0::float8, NULL::float8)
        ) AS rast
      FROM aoi
      CROSS JOIN ref_raster ref
    )`);

  const filterMaskCteNames: string[] = [];

  if (raster_filters) {
    for (const baseTable of enabledRasterFilterTables) {
      const values = raster_filters[baseTable];
      if (!values || values.length === 0) continue;

      const table = selectOverviewTable(baseTable, aoiAreaM2);
      const clippedRaster = `clipped_${table}`;
      const filterMaskCte = `filter_mask_${baseTable}`;

      ctes.push(`${clippedRaster} AS MATERIALIZED (
          SELECT ST_Union(ST_Clip(rr.rast, aoi.geom, touched => TRUE)) AS rast
          FROM ${schema}.${table} rr
          CROSS JOIN aoi
          WHERE ST_Intersects(rr.rast, aoi.geom)
        )`);

      // Mapping all values in the filter to 1, and everything else to 0
      const reclassExpr = values.map(v => `${v}:1`).join(',');

      ctes.push(`${filterMaskCte} AS MATERIALIZED (
          SELECT ST_Resample(
            ST_Reclass(cr.rast, 1, '${reclassExpr}', '1BB', NULL::float8),
            ref.rast,
            'NearestNeighbour'
          ) AS rast
          FROM ${clippedRaster} cr
          CROSS JOIN ref_raster ref
        )`);

      filterMaskCteNames.push(filterMaskCte);
    }
  }

  if (filterMaskCteNames.length === 0) {
    ctes.push(`rasterized AS MATERIALIZED (
        SELECT r.rast, ref.width, ref.height, ref.pixel_size,
               ref.min_x, ref.min_y, ref.max_x, ref.max_y
        FROM rasterized_aoi r
        CROSS JOIN ref_raster ref
      )`);
  } else {
    let rastExpr = 'rasterized_aoi.rast';
    for (const fmCte of filterMaskCteNames) {
      rastExpr = `ST_MapAlgebra(${rastExpr}, ${fmCte}.rast, '[rast1] * [rast2]', '1BB', 'INTERSECTION')`;
    }
    const fromClause = ['rasterized_aoi', ...filterMaskCteNames].join(', ');
    ctes.push(`rasterized AS MATERIALIZED (
        SELECT
          ${rastExpr} AS rast,
          ref.width, ref.height, ref.pixel_size,
          ref.min_x, ref.min_y, ref.max_x, ref.max_y
        FROM ${fromClause}
        CROSS JOIN ref_raster ref
      )`);
  }

  return { ctes, params };
};

const buildVectorMaskCtes = (
  filter: DataFilter,
  enabledRasterFilterTables: string[],
): { ctes: string[]; resultExpr: string; fromTables: string; whereClause: string; params: any[] } => {
  const schema = process.env.POSTGRES_SCHEMA;
  const params: any[] = [filter.geometryIds];

  const aoiAreaM2 = filter.area;
  const raster_filters = filter.parameters.raster_filters;
  const ctes: string[] = [];
  const maskCteNames: string[] = [];

  ctes.push(`aoi AS MATERIALIZED (
      SELECT ugs.geom
      FROM ${schema}.user_geometry_subdivisions ugs WHERE ugs.user_geometry_id = ANY($1::uuid[])
    )`);

  if (raster_filters) {
    for (const baseTable of enabledRasterFilterTables) {
      const values = raster_filters[baseTable];
      if (!values || values.length === 0) continue;

      const table = selectOverviewTable(baseTable, aoiAreaM2);
      const clippedRaster = `clipped_${table}`;
      const maskCte = `mask_${baseTable}`;

      ctes.push(`${clippedRaster} AS MATERIALIZED (
          SELECT ST_Union(ST_Clip(rr.rast, aoi.geom, touched => TRUE)) AS rast
          FROM ${schema}.${table} rr
          CROSS JOIN aoi
          WHERE ST_Intersects(rr.rast, aoi.geom)
        )`);

      ctes.push(`${maskCte} AS MATERIALIZED (
          SELECT ST_Union(dp.geom) AS geom
          FROM ${clippedRaster}
          CROSS JOIN LATERAL ST_DumpAsPolygons(${clippedRaster}.rast) dp
          WHERE dp.val = ANY(ARRAY[${values.join(',')}]::double precision[])
        )`);

      maskCteNames.push(maskCte);
    }
  }

  const resultExpr = maskCteNames.reduce((acc, maskCte) => `ST_Intersection(${acc}, ${maskCte}.geom)`, 'aoi.geom');
  const fromTables = ['aoi', ...maskCteNames].join(', ');
  const whereClause = maskCteNames.length > 0 ? `WHERE ${maskCteNames.map(m => `${m}.geom IS NOT NULL`).join(' AND ')}` : '';

  return { ctes, resultExpr, fromTables, whereClause, params };
};
