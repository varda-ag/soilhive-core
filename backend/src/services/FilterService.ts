import { valid } from 'geojson-validation';
import { StatusCodes } from 'http-status-codes';
import * as turf from '@turf/turf';
import { latLngToCell } from 'h3-js';
import { Polygon, MultiPolygon } from 'geojson';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import { DataFilterDTO, FilteredDatasetSummary, FilteredDataset, FilteredData, DataFilter } from '../interfaces/DatasetFilter';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import { mergeMin, mergeMax } from '../utils/utils';
import DataFilterEntity from '../entities/DataFilter';
import DataFilterUserGeometryEntity from '../entities/DataFilterUserGeometry';
import { DataAvailabilityIndex } from '../interfaces/Dai';
import { getPolygonFromBbox, geometryUnion } from '../utils/geometry';

const sds = new SoilDataStorage();

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

    const owner = requestData.token?.sub;
    const repo = requestData.entityManager.getRepository(DataFilterEntity);
    const entity = repo.create({ filter, ...(owner ? { owner } : {}) });
    const savedFilter = await repo.save(entity);

    await Promise.all(
      filter.geometries.map(async geometry => {
        const { id: user_geometry_id } = await this.insertUserGeometry(requestData, geometry);
        // A filter's geometries are a set: payload geometries that canonicalise to
        // the same stored row collapse to a single join entry.
        await requestData.entityManager
          .createQueryBuilder()
          .insert()
          .into(DataFilterUserGeometryEntity)
          .values({ data_filter_id: savedFilter.id, user_geometry_id })
          .orIgnore()
          .execute();
      }),
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
    const filter = await this.getFilterById(requestData, filterId);
    const effectiveFilter = geometryOnly ? { ...filter, parameters: {} } : filter;
    const [vectorDatasets, rasterDatasets, rasterCoverage] = await Promise.all([
      sds.filterVector(requestData.entityManager, effectiveFilter),
      sds.filterRaster(requestData.entityManager, effectiveFilter),
      sds.getRasterCoverage(requestData.entityManager, effectiveFilter),
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
        .then(results => results.map(({ id, name, data_type }) => ({ id, name, data_type }))),
    ]);
    return [...vectorDatasets, ...rasterDatasets];
  };

  getDai = async (
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

    const { id: userGeometryId, area } = await this.insertUserGeometry(requestData, effectiveAoi);

    let rows: Awaited<ReturnType<typeof sds.getDaiPointData>>;
    try {
      rows = await sds.getDaiPointData(requestData.entityManager, { geometryIds: [userGeometryId], parameters, area });
    } finally {
      await this.deleteUserGeometry(requestData, userGeometryId);
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
