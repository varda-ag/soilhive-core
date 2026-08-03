import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StatusCodes } from 'http-status-codes';
import { Geometry, MultiPolygon, Polygon } from 'geojson';
import FileService from '../../services/FileService';
import FilterService from '../../services/FilterService';
import { RequestData } from '../../interfaces/RequestData';
import { FilterCriteria } from '../../interfaces/DatasetFilter';
import { VectorFileMetadata } from '../../interfaces/File';
import { JobError } from '../../errors/JobError';
import { ErrorResponse } from '../../utils/error';
import { GdalCLI } from '../../utils/GdalCLI';
import { log } from '../../utils/logger';
import { round3 } from '../../utils/utils';
import { AggregationUnit } from './types';

const filterService = new FilterService();
const fileService = new FileService();

export interface ExtractedUnits {
  units: AggregationUnit[];
  unitIds: string[];
  /** Null for the no-file case, where the units are the source Filter's own geometries. */
  derivedFilterId: string | null;
}

const isPolygonal = (geometry: Geometry | null): geometry is Polygon | MultiPolygon =>
  geometry !== null && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon');

/**
 * Reads the aggregation boundaries out of an uploaded file and turns each into an
 * Aggregation Unit — a UserGeometry — linked to a new Derived Filter.
 *
 * Everything that can reject the input is checked before a single row is written, so an
 * unusable file costs nothing and leaves nothing behind. `-limit maxUnits + 1` is what
 * makes that promise hold for size: memory is bounded by the cap regardless of how large
 * the file is, and without relying on the driver reporting a feature count (several
 * report none).
 *
 * Two deliberate differences from FileService.fileToDB, which reads files for ingestion:
 *  - no `-explodecollections`: a MultiPolygon farm of three disjoint parcels is ONE
 *    Aggregation Unit, and user_geometries stores MultiPolygon natively. Exploding would
 *    silently split one reporting area into three.
 *  - geometries go in through insertUserGeometry one at a time rather than in bulk SQL.
 *    That contract (ST_MakeValid exactly once, ON CONFLICT DO NOTHING) is fragile enough
 *    that its own source warns reimplementation drifts geom_hash and corrupts dedup; the
 *    unit cap is what makes paying per-geometry round trips affordable.
 */
export const extractUnitsFromFile = async (
  requestData: RequestData,
  input: { fileId: string; parameters: FilterCriteria; labelField?: string | undefined; maxUnits: number },
): Promise<ExtractedUnits> => {
  const { fileId, parameters, labelField, maxUnits } = input;

  const fileEntity = await fileService.getFile(requestData, fileId).catch(error => {
    if (error instanceof ErrorResponse && error.status === StatusCodes.NOT_FOUND) {
      throw new JobError('SST_FILE_NOT_FOUND', { file_id: fileId });
    }
    throw error;
  });

  // Absent metadata means the File was uploaded as non-spatial: nothing probed it, so it
  // has no CRS and no geometry to read (see CONTEXT.md — this is not "a failed upload").
  if (!fileEntity.metadata) {
    throw new JobError('SST_FILE_NOT_SPATIAL', { file_id: fileId });
  }
  if (fileEntity.metadata.is_raster) {
    throw new JobError('SST_FILE_IS_RASTER', { file_id: fileId });
  }
  const metadata = fileEntity.metadata as VectorFileMetadata;
  if (!metadata.epsg) {
    throw new JobError('SST_MISSING_EPSG', { file_id: fileId });
  }
  // Re-checked here even though the enqueue path validates it: a processor must not
  // trust job data, which outlives the request that produced it.
  if (labelField && !metadata.field_names.includes(labelField)) {
    throw new JobError('SST_UNKNOWN_LABEL_FIELD', { label_field: labelField });
  }

  const { mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(fileEntity.file_path).catch(error => {
    if (error instanceof ErrorResponse && error.status === StatusCodes.NOT_FOUND) {
      throw new JobError('SST_FILE_NOT_FOUND', { file_id: fileId });
    }
    throw error;
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soil-statistics-'));
  const outputPath = path.join(tempDir, 'units.geojson');

  let features: { geometry: Geometry | null; id?: string | number; properties: Record<string, unknown> | null }[];
  try {
    const args = [
      '-f',
      'GeoJSON',
      outputPath,
      mainFilePath,
      ...(metadata.layer_name ? [metadata.layer_name] : []),
      '-s_srs',
      `EPSG:${metadata.epsg}`,
      '-t_srs',
      'EPSG:4326',
      // One more than the cap: reading exactly maxUnits could not distinguish a file
      // that fits from one that was silently cut off at the limit.
      '-limit',
      String(maxUnits + 1),
      ...(labelField ? ['-select', labelField] : []),
    ];
    await GdalCLI.ogr2ogr(args);
    const collection = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    features = collection.features ?? [];
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (tempZipExtractPath) {
      fs.rmSync(tempZipExtractPath, { recursive: true, force: true });
    }
  }

  if (features.length === 0) {
    throw new JobError('SST_NO_UNITS', { file_id: fileId });
  }
  if (features.length > maxUnits) {
    throw new JobError('SST_TOO_MANY_UNITS', { max_units: maxUnits });
  }
  const nonPolygonCount = features.filter(feature => !isPolygonal(feature.geometry)).length;
  if (nonPolygonCount > 0) {
    throw new JobError('SST_NON_POLYGON_GEOMETRY', { count: nonPolygonCount, file_id: fileId });
  }

  // Canonicalisation deduplicates: two rows whose geometries are equivalent resolve to
  // the same UserGeometry, so the unit keeps both record ids (and both labels, joined)
  // rather than one row silently winning.
  const byUnit = new Map<string, { record_ids: number[]; labels: string[]; area_m2: number | null }>();
  for (const [index, feature] of features.entries()) {
    const geometry = feature.geometry as Polygon | MultiPolygon;
    const { id, area } = await filterService.insertUserGeometry(requestData, geometry);
    const recordId = typeof feature.id === 'number' ? feature.id : index + 1;
    const label = labelField ? feature.properties?.[labelField] : undefined;

    const existing = byUnit.get(id);
    if (existing) {
      existing.record_ids.push(recordId);
      if (label !== undefined && label !== null && !existing.labels.includes(String(label))) {
        existing.labels.push(String(label));
      }
    } else {
      byUnit.set(id, {
        record_ids: [recordId],
        labels: label !== undefined && label !== null ? [String(label)] : [],
        area_m2: area,
      });
    }
  }

  const unitIds = [...byUnit.keys()];
  const derivedFilter = await filterService.createDerivedFilter(requestData, {
    geometryIds: unitIds,
    parameters,
    sourceFileId: fileEntity.id,
    name: fileEntity.name,
  });

  log.info('Aggregation units extracted from file', {
    file_id: fileEntity.id,
    source_features: features.length,
    units: unitIds.length,
    derived_filter_id: derivedFilter.id,
  });

  return {
    unitIds,
    derivedFilterId: derivedFilter.id,
    units: unitIds.map(unitId => {
      const entry = byUnit.get(unitId)!;
      return {
        unit_id: unitId,
        label: entry.labels.length > 0 ? entry.labels.join('; ') : null,
        record_ids: entry.record_ids,
        area_m2: round3(entry.area_m2),
        raster_filtered: false,
      };
    }),
  };
};

/** No-file case: the Aggregation Units are the source Filter's own UserGeometries. */
export const unitsFromFilter = async (requestData: RequestData, geometryIds: string[]): Promise<ExtractedUnits> => {
  if (geometryIds.length === 0) {
    throw new JobError('SST_NO_GEOMETRIES');
  }
  const schema = process.env.POSTGRES_SCHEMA;
  const rows: { id: string; area: string | null }[] = await requestData.entityManager.query(
    `SELECT ug.id, ug.area FROM ${schema}.user_geometries ug WHERE ug.id = ANY($1::uuid[]) ORDER BY ug.id`,
    [geometryIds],
  );

  return {
    unitIds: rows.map(row => row.id),
    derivedFilterId: null,
    units: rows.map(row => ({
      unit_id: row.id,
      label: null,
      record_ids: [],
      area_m2: row.area !== null ? round3(Number(row.area)) : null,
      raster_filtered: false,
    })),
  };
};
