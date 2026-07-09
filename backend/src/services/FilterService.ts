import { createHash } from 'node:crypto';
import { valid } from 'geojson-validation';
import { StatusCodes } from 'http-status-codes';
import * as turf from '@turf/turf';
import { latLngToCell } from 'h3-js';
import { Polygon, MultiPolygon } from 'geojson';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import {
  DataFilterDTO,
  FilterCriteria,
  FilteredDatasetSummary,
  FilteredDataset,
  FilteredData,
  DataFilter,
} from '../interfaces/DatasetFilter';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { mergeMin, mergeMax } from '../utils/utils';
import DataFilterEntity from '../entities/DataFilter';
import DataFilterUserGeometryEntity from '../entities/DataFilterUserGeometry';
import { DataAvailabilityIndex } from '../interfaces/Dai';
import { getPolygonFromBbox, geometryUnion } from '../utils/geometry';
import { timed, log } from '../utils/logger';
import { CACHE_TTL_SPATIAL_MS, cachedCompute } from '../utils/query-cache';
import { DaiPointRow, getDaiPointDataPrecomputed, isUnfilteredDaiParameters } from '../data-layer/DaiStats';

const sds = new SoilDataStorage();

const sortedUnique = <T extends string | number | null>(values: T[]): T[] =>
  [...new Set(values)].sort((a, b) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a < b ? -1 : 1;
  });

// Canonical content identity of a filter (ADR 0007): the sorted set of canonical
// user_geometry ids plus normalized parameters, serialized with a fixed key order.
// List criteria compare as sets (contents sorted and deduped), but an EMPTY list is
// not collapsed into an absent key: `data_types: []` matches nothing in filterVector
// while an absent data_types is unconstrained. Explicit nulls are likewise preserved:
// `min_depth: null` matches layers WITHOUT a recorded depth, whereas an absent
// min_depth is unconstrained (see the scalar handling in SoilDataStorage).
export const computeFilterHash = (userGeometryIds: string[], parameters: FilterCriteria): string => {
  const normalized: Record<string, unknown> = {};
  for (const key of ['data_types', 'licenses', 'horizons', 'soil_properties'] as const) {
    const values = parameters[key];
    if (values !== undefined) normalized[key] = sortedUnique(values as (string | null)[]);
  }
  for (const key of ['min_sampling_date', 'max_sampling_date', 'min_depth', 'max_depth'] as const) {
    if (parameters[key] !== undefined) normalized[key] = parameters[key];
  }
  if (parameters.raster_filters !== undefined) {
    const rasterFilters: Record<string, number[]> = {};
    for (const table of Object.keys(parameters.raster_filters).sort()) {
      rasterFilters[table] = sortedUnique(parameters.raster_filters[table] ?? []);
    }
    normalized['raster_filters'] = rasterFilters;
  }
  return createHash('sha256')
    .update(JSON.stringify({ geometry_ids: sortedUnique(userGeometryIds), parameters: normalized }))
    .digest('hex');
};

export default class FilterService {
  insertUserGeometry = async (requestData: RequestData, geometry: Polygon | MultiPolygon): Promise<{ id: string; area: number }> => {
    const schema = process.env.POSTGRES_SCHEMA;
    const geomJson = JSON.stringify(geometry);
    // The geometry is canonicalised with ST_MakeValid exactly once, here, before it
    // is hashed and stored. ST_MakeValid is not byte-idempotent (re-applying it can
    // change the byte representation and therefore geom_hash), so a stored row must
    // never be rewritten: on a dedup hit we DO NOTHING and return the existing row
    // as is. Do not "simplify" this to ON CONFLICT DO UPDATE — repeated submissions
    // of the same geometry would then drift the row's hash and eventually collide
    // with the duplicate row created in the meantime (unique violation on geom_hash).
    // The fallback SELECT's hash expression must mirror the generated geom_hash
    // column in the user_geometries migration.
    const query = `
      WITH input AS (
        SELECT ST_MakeValid(ST_GeomFromGeoJSON($1), 'method=structure') AS geom
      ), inserted AS (
        INSERT INTO ${schema}.user_geometries (geom)
        SELECT geom FROM input
        ON CONFLICT (geom_hash) DO NOTHING
        RETURNING id, area
      )
      SELECT id, area FROM inserted
      UNION ALL
      SELECT ug.id, ug.area
      FROM ${schema}.user_geometries ug, input
      WHERE ug.geom_hash = encode(sha256(input.geom::TEXT::BYTEA), 'hex')
      LIMIT 1`;
    // The insert can conflict with a row committed after this statement's snapshot,
    // which the fallback SELECT then cannot see; a second attempt takes a fresh
    // snapshot and finds it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const rows: { id: string; area: number }[] = await requestData.entityManager.query(query, [geomJson]);
      const [row] = rows;
      if (row) return { id: row.id, area: Number(row.area) };
    }
    throw new ErrorResponse('Failed to store filtering geometry', StatusCodes.INTERNAL_SERVER_ERROR);
  };

  deleteUserGeometry = async (requestData: RequestData, id: string): Promise<void> => {
    const schema = process.env.POSTGRES_SCHEMA;
    await requestData.entityManager.query(
      `DELETE FROM ${schema}.user_geometries
       WHERE id = $1
       AND NOT EXISTS (
         SELECT 1 FROM ${schema}.data_filter_user_geometries WHERE user_geometry_id = $1
       )`,
      [id],
    );
  };

  createFilter = async (requestData: RequestData, filter: DataFilterDTO): Promise<DataFilterEntity> => {
    // Validate geometries in the payload
    for (const geometry of filter.geometries) {
      if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) {
        throw new ErrorResponse(
          `Unsupported filtering geometry type: ${geometry.type} (allowed: Polygon, MultiPolygon)`,
          StatusCodes.BAD_REQUEST,
        );
      }
      if (!valid(geometry)) {
        throw new ErrorResponse(`Invalid geometry provided for filtering: ${JSON.stringify(geometry)}`, StatusCodes.BAD_REQUEST);
      }
    }

    // Geometries are stored (and deduplicated) before the filter row so the filter's
    // identity can be computed over their canonical ids. A filter's geometries are a
    // set: payload geometries that canonicalise to the same stored row collapse to one.
    const geometryIds = [
      ...new Set(await Promise.all(filter.geometries.map(async geometry => (await this.insertUserGeometry(requestData, geometry)).id))),
    ];

    const owner = requestData.token?.sub || null;
    const filterHash = computeFilterHash(geometryIds, filter.parameters);
    const schema = process.env.POSTGRES_SCHEMA;
    // Upsert on canonical content identity: resubmitting an equivalent filter returns
    // the existing row (with its originally submitted raw DTO, which may differ
    // byte-wise from the current submission). Unlike user_geometries — where DO NOTHING
    // is mandatory because geom_hash derives from stored bytes — DO UPDATE is safe here:
    // filter_hash is computed from canonical inputs and cannot drift. Bumping updated_at
    // gives it "last used" semantics, so an age-based cleanup of non-persistent filters
    // must reap on updated_at, never created_at. See ADR 0007.
    const rows: DataFilterEntity[] = await requestData.entityManager.query(
      `INSERT INTO ${schema}.data_filters (filter, filter_hash, owner)
       VALUES ($1::jsonb, $2, $3)
       ON CONFLICT ("owner", "filter_hash") WHERE deleted_at IS NULL AND filter_hash IS NOT NULL
       DO UPDATE SET updated_at = now()
       RETURNING id, created_at, updated_at, deleted_at, filter, persistent, name, owner`,
      [JSON.stringify(filter), filterHash, owner],
    );
    const savedFilter = rows[0]!;

    await Promise.all(
      geometryIds.map(user_geometry_id =>
        requestData.entityManager
          .createQueryBuilder()
          .insert()
          .into(DataFilterUserGeometryEntity)
          .values({ data_filter_id: savedFilter.id, user_geometry_id })
          .orIgnore()
          .execute(),
      ),
    );

    return savedFilter;
  };

  getFilters = async (requestData: RequestData): Promise<DataFilterEntity[]> => {
    const owner = requestData.token?.sub;
    if (!owner) {
      throw new ErrorResponse('Cannot retrieve filters for unauthenticated user', StatusCodes.UNAUTHORIZED);
    }
    const repo = requestData.entityManager.getRepository(DataFilterEntity);
    return await repo.findBy({ owner });
  };

  getDataFilterEntityById = async (requestData: RequestData, filterId: string): Promise<DataFilterEntity> => {
    const repo = requestData.entityManager.getRepository(DataFilterEntity);
    const storedFilter = await repo.findOneBy({ id: filterId });
    if (!storedFilter) {
      throw new ErrorResponse(`Filter ${filterId} not found`, StatusCodes.NOT_FOUND);
    }
    return storedFilter;
  };

  getFilterById = async (requestData: RequestData, filterId: string): Promise<DataFilter> => {
    const schema = process.env.POSTGRES_SCHEMA;
    const result = await requestData.entityManager.query(
      `SELECT
        df.filter->'parameters' AS parameters,
        COALESCE(ARRAY_AGG(dfug.user_geometry_id) FILTER (WHERE dfug.user_geometry_id IS NOT NULL), '{}') AS geometry_ids,
        COALESCE(SUM(ug.area), 0) AS area
      FROM ${schema}.data_filters df
      LEFT JOIN ${schema}.data_filter_user_geometries dfug ON dfug.data_filter_id = df.id
      LEFT JOIN ${schema}.user_geometries ug ON ug.id = dfug.user_geometry_id
      WHERE df.id = $1 AND df.deleted_at IS NULL
      GROUP BY df.id, df.filter`,
      [filterId],
    );
    if (!result.length) {
      throw new ErrorResponse(`Filter ${filterId} not found`, StatusCodes.NOT_FOUND);
    }
    return {
      geometryIds: result[0].geometry_ids,
      parameters: result[0].parameters,
      area: Number(result[0].area),
    };
  };

  getCoverage = async (requestData: RequestData, filterId: string, geometryOnly: boolean): Promise<FilteredData> => {
    const filter = await timed('coverage.getFilterById', () => this.getFilterById(requestData, filterId), { filterId });
    const effectiveFilter = geometryOnly ? { ...filter, parameters: {} } : filter;
    const [vectorDatasets, rasterDatasets, rasterCoverage] = await Promise.all([
      timed('coverage.filterVector', () => sds.filterVector(requestData.entityManager, effectiveFilter), { filterId }),
      timed('coverage.filterRaster', () => sds.filterRaster(requestData.entityManager, effectiveFilter), { filterId }),
      timed('coverage.getRasterCoverage', () => sds.getRasterCoverage(requestData.entityManager, effectiveFilter), { filterId }),
    ]);
    const datasets = mergeDatasetSummaries([vectorDatasets, rasterDatasets]);
    return { datasets, raster_filters: rasterCoverage };
  };

  getDatasets = async (requestData: RequestData, filterId: string): Promise<FilteredDataset[]> => {
    const filter = await this.getFilterById(requestData, filterId);
    const [vectorDatasets, rasterDatasets] = await Promise.all([
      sds.filterVectorDatasets(requestData.entityManager, filter),
      sds
        .filterRaster(requestData.entityManager, filter)
        .then(results => results.map(({ id, name, data_type, visibility }) => ({ id, name, data_type, visibility }))),
    ]);
    return [...vectorDatasets, ...rasterDatasets];
  };

  // Cached at the service boundary rather than the query layer: each computation
  // queries against an ephemeral UserGeometry UUID that never repeats, so no
  // SQL-derived cache key can ever hit. The manual key is complete because a
  // Filter's content is immutable per id (deduplicated by content identity,
  // see docs/adr/0007) and /dai is not entitlement-gated.
  getDai = async (
    requestData: RequestData,
    bbox: [number, number, number, number],
    resolution: number,
    filterId: string,
  ): Promise<DataAvailabilityIndex> => {
    return cachedCompute(`dai:${filterId}:${bbox.join(',')}:${resolution}`, CACHE_TTL_SPATIAL_MS, () =>
      this.computeDai(requestData, bbox, resolution, filterId),
    );
  };

  private computeDai = async (
    requestData: RequestData,
    bbox: [number, number, number, number],
    resolution: number,
    filterId: string,
  ): Promise<DataAvailabilityIndex> => {
    const filter = await this.getFilterById(requestData, filterId);
    const { geometryIds, parameters } = filter;

    const bboxPolygon = getPolygonFromBbox(bbox);
    let effectiveAoi: Polygon | MultiPolygon;
    if (geometryIds.length === 0) {
      effectiveAoi = bboxPolygon;
    } else {
      const schema = process.env.POSTGRES_SCHEMA;
      const geomRows: { geom: Polygon | MultiPolygon }[] = await requestData.entityManager.query(
        `SELECT ST_AsGeoJSON(ug.geom)::json AS geom FROM ${schema}.user_geometries ug WHERE ug.id = ANY($1::uuid[])`,
        [geometryIds],
      );
      const filterGeom = geometryUnion(geomRows.map(r => r.geom));
      const intersection = turf.intersect(turf.featureCollection([turf.feature(filterGeom), turf.feature(bboxPolygon)]));
      if (!intersection) return { resolution, min: 0, max: 0, cells: {} };
      effectiveAoi = intersection.geometry;
    }

    let rows: DaiPointRow[];
    if (isUnfilteredDaiParameters(parameters)) {
      // Unfiltered viewports read the ingestion-time feature_dai_stats rows: a
      // GiST point lookup instead of the per-feature LATERAL aggregation, and no
      // user-geometry insert/subdivide/delete round-trip on a GET.
      rows = await timed('dai.precomputed', () => getDaiPointDataPrecomputed(requestData.entityManager, effectiveAoi));
    } else {
      const { id: userGeometryId, area } = await this.insertUserGeometry(requestData, effectiveAoi);

      try {
        rows = await sds.getDaiPointData(requestData.entityManager, { geometryIds: [userGeometryId], parameters, area });
      } finally {
        // Catch here so that original exception isn't masked by cleanup failure
        await this.deleteUserGeometry(requestData, userGeometryId).catch((err: unknown) =>
          log.error('Failed to clean up user geometry', { userGeometryId, error: String(err) }),
        );
      }
    }

    const cells: Record<string, number> = {};
    for (const row of rows) {
      const cellId = latLngToCell(row.lat, row.lon, resolution);
      const score = row.num_soil_properties + row.num_props_below_30 + row.num_dated_layers + row.num_distinct_years;
      cells[cellId] = (cells[cellId] ?? 0) + score;
    }

    const values = Object.values(cells);
    if (values.length === 0) return { resolution, min: 0, max: 0, cells: {} };
    return {
      resolution,
      min: Math.min(...values),
      max: Math.max(...values),
      cells,
    };
  };
}

export const mergeDatasetSummaries = (batches: FilteredDatasetSummary[][]): FilteredDatasetSummary[] => {
  const acc = new Map<string, FilteredDatasetSummary>();
  for (const batch of batches) {
    for (const ds of batch) {
      const existing = acc.get(ds.id);
      if (!existing) {
        acc.set(ds.id, {
          ...ds,
          licenses: [...(ds.licenses ?? [])],
          soil_properties: [...(ds.soil_properties ?? [])],
        });
        continue;
      }
      existing.dataset_layer_count = (existing.dataset_layer_count ?? 0) + (ds.dataset_layer_count ?? 0);
      existing.raster_layer_count = (existing.raster_layer_count ?? 0) + (ds.raster_layer_count ?? 0);
      existing.licenses = [...new Set([...(existing.licenses ?? []), ...(ds.licenses ?? [])])];
      existing.soil_properties = [...new Set([...(existing.soil_properties ?? []), ...(ds.soil_properties ?? [])])];
      existing.min_sampling_date = mergeMin(existing.min_sampling_date ?? null, ds.min_sampling_date ?? null);
      existing.max_sampling_date = mergeMax(existing.max_sampling_date ?? null, ds.max_sampling_date ?? null);
      existing.min_depth =
        existing.min_depth === null || ds.min_depth === null ? null : Math.min(existing.min_depth ?? Infinity, ds.min_depth ?? Infinity);
      existing.max_depth =
        existing.max_depth === null || ds.max_depth === null ? null : Math.max(existing.max_depth ?? -Infinity, ds.max_depth ?? -Infinity);
    }
  }
  return Array.from(acc.values());
};
