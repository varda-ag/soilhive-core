import * as path from 'path';
import { Readable } from 'stream';
import { Polygon, MultiPolygon } from 'geojson';
import SoilDataStorage from '../../data-layer/SoilDataStorage';
import { JsonStorage } from '../../entities/JsonStorage';
import { RequestData } from '../../interfaces/RequestData';
import { SoilDataSample } from '../../interfaces/SoilDataSample';
import ConfigService from '../../services/ConfigService';
import FileService from '../../services/FileService';
import FilterService from '../../services/FilterService';
import RasterFilterService from '../../services/RasterFilterService';
import SoilPropertyService from '../../services/SoilPropertyService';
import { generateExportPdf } from './pdfGenerator';
import { GroupedRecords, soilSampleToExportRecord, VectorFileFormat, RasterFileFormat } from './types';
import { getEntities } from '../../utils/slugs';
import DatasetEntity from '../../entities/Dataset';
import { EntityType } from '../../types/data';
import { ExportJobParameters } from '../../interfaces/Job';
import { FilterCriteria, FilteredRasterLayer } from '../../interfaces/DatasetFilter';
import { GISDataType } from '../../types/data';
import { getExportBatchSize } from '../../utils/utils';

const filterService = new FilterService();
const soilDataStorage = new SoilDataStorage();

export async function getTotalRecordsCount(requestData: RequestData, payload: ExportJobParameters): Promise<number> {
  const storedFilter = await filterService.getFilterById(requestData, payload.filter_id);
  return await soilDataStorage.getSoilDataCount(requestData, storedFilter.filter, payload.dataset_ids);
}

/**
 * Fetch a batch of soil data samples
 * @param requestData - RequestData containing user and entity manager information
 * @param payload - Job payload
 * @param cursor - Pagination cursor (undefined for first batch)
 * @returns Array of soil data samples
 */
export async function fetchBatch(requestData: RequestData, payload: ExportJobParameters, cursor?: string): Promise<SoilDataSample[]> {
  const storedFilter = await filterService.getFilterById(requestData, payload.filter_id);
  return await soilDataStorage.getSoilData(requestData, storedFilter.filter, payload.dataset_ids, getExportBatchSize(), cursor, undefined);
}

/**
 * Group batch records by property acronym
 * @param samples - Array of soil data samples
 * @returns Records grouped by property acronym
 */
export function groupByProperty(samples: SoilDataSample[]): GroupedRecords {
  const grouped: GroupedRecords = {};

  for (const sample of samples) {
    const propertyKey = sample.property_name.replace(/ /g, '_');

    if (!grouped[propertyKey]) {
      grouped[propertyKey] = [];
    }

    const exportRecord = soilSampleToExportRecord(sample);
    grouped[propertyKey].push(exportRecord);
  }

  return grouped;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function getFilterString(requestData: RequestData, filterEntity: FilterCriteria): Promise<string | null> {
  const parts: string[] = [];

  if (filterEntity.min_sampling_date && filterEntity.max_sampling_date) {
    parts.push(`Sampling date: [${filterEntity.min_sampling_date}, ${filterEntity.max_sampling_date}]`);
  } else if (filterEntity.min_sampling_date) {
    parts.push(`Sampling date: from ${filterEntity.min_sampling_date}`);
  } else if (filterEntity.max_sampling_date) {
    parts.push(`Sampling date: to ${filterEntity.max_sampling_date}`);
  }

  if (filterEntity.min_depth && filterEntity.max_depth) {
    parts.push(`Depth: [${filterEntity.min_depth}, ${filterEntity.max_depth}] cm`);
  } else if (filterEntity.min_depth) {
    parts.push(`Depth: from ${filterEntity.min_depth} cm`);
  } else if (filterEntity.max_depth) {
    parts.push(`Depth: to ${filterEntity.max_depth} cm`);
  }

  const horizons = filterEntity.horizons?.filter((h): h is string => h !== null && h !== undefined);
  if (horizons?.length) {
    parts.push(`Horizons: ${horizons.join(', ')}`);
  }

  if (filterEntity.soil_properties?.length) {
    const soilPropertyService = new SoilPropertyService();
    const properties = await soilPropertyService.getSoilPropertiesBySlug(requestData, filterEntity.soil_properties);
    parts.push(`Soil properties: ${properties.map(p => p.property_name).join(', ')}`);
  }

  if (filterEntity.raster_filters && Object.keys(filterEntity.raster_filters).length > 0) {
    const rasterFilterService = new RasterFilterService();
    const allRasterFilters = await rasterFilterService.getRasterFilters(requestData);
    const rasterFilterMap = new Map(allRasterFilters.map(rf => [rf.id, rf]));

    for (const [tableId, values] of Object.entries(filterEntity.raster_filters)) {
      const rasterFilter = rasterFilterMap.get(tableId);
      if (!rasterFilter?.mappings) continue;

      const reverseMap = new Map(Object.entries(rasterFilter.mappings).map(([label, num]) => [num, label]));
      const labels = values.map(v => reverseMap.get(v) ?? String(v));
      parts.push(`${rasterFilter.name}: ${labels.join(', ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

export async function createReadmeFile(requestData: RequestData, tempDir: string, payload: ExportJobParameters): Promise<void> {
  const readmePath = path.join(tempDir, 'Readme.pdf');

  const configService = new ConfigService();
  const logoFileKey = await configService.getLogoFileKey(requestData.entityManager.getRepository(JsonStorage));

  let logoBuffer: Buffer | null = null;
  if (logoFileKey) {
    const storage = FileService.getStorageEngine();
    const logoStream = await storage.read(logoFileKey);
    logoBuffer = await streamToBuffer(logoStream as Readable);
  }

  const datasets = await getEntities(requestData, DatasetEntity, EntityType.DATASET, payload.dataset_ids);
  const datasetPdfInfo = datasets.map(ds => ({
    slug: ds.slug,
    name: ds.name,
    url: payload.public_metadata_urls ? payload.public_metadata_urls[ds.slug] : undefined,
    gis_datatype: ds.gis_datatype!,
  }));

  const filterEntity = await filterService.getFilterById(requestData, payload.filter_id);
  const filter = await getFilterString(requestData, filterEntity.filter.parameters);

  const hasVector = datasetPdfInfo.some(ds => ds.gis_datatype !== GISDataType.RASTER);
  const hasRaster = datasetPdfInfo.some(ds => ds.gis_datatype === GISDataType.RASTER);

  const { vectorFormat } = validateFileFormats(payload.formats, hasVector, hasRaster);

  await generateExportPdf({
    outputPath: readmePath,
    datasets: datasetPdfInfo,
    filter,
    logoBuffer,
    fileFormat: vectorFormat ?? '',
    exportDate: new Date(),
    homepageUrl: payload.public_homepage_url,
    termsUrl: payload.public_terms_url,
    hasVector,
    hasRaster,
  });
}

export async function getTotalLayersCount(requestData: RequestData, payload: ExportJobParameters): Promise<number> {
  if (!payload.dataset_ids?.length) return 0;
  const storedFilter = await filterService.getFilterById(requestData, payload.filter_id);
  const { layers } = await soilDataStorage.getRasterLayers(requestData, storedFilter.filter, payload.dataset_ids);
  return layers.length;
}

export async function fetchRasterLayers(
  requestData: RequestData,
  payload: ExportJobParameters,
): Promise<{ layers: FilteredRasterLayer[]; aoi: Polygon | MultiPolygon | null }> {
  if (!payload.dataset_ids?.length) return { layers: [], aoi: null };
  const storedFilter = await filterService.getFilterById(requestData, payload.filter_id);
  const { layers, aoi } = await soilDataStorage.getRasterLayers(requestData, storedFilter.filter, payload.dataset_ids);
  return { layers, aoi };
}

/**
 * Combines vector and raster export progress into a single percentage.
 *
 * Raster work scales with AOI area (more pixels per layer → more time), so the raster
 * contribution is weighted by `aoiAreaKm2`. Vector work scales with record count.
 * When only one type is present, its fraction is returned directly.
 */
export function computeCombinedProgress(
  vectorProcessed: number,
  totalVectorRecords: number,
  rasterProcessed: number,
  totalRasterLayers: number,
  aoiAreaKm2: number | null, // aoiAreaKm2 is not required if only vector data is requested
): number {
  const vectorFraction = totalVectorRecords > 0 ? vectorProcessed / totalVectorRecords : null;
  const rasterFraction = totalRasterLayers > 0 ? rasterProcessed / totalRasterLayers : null;

  if (vectorFraction === null && rasterFraction === null) return 0;
  if (vectorFraction === null) return Math.round(rasterFraction! * 100);
  if (rasterFraction === null) return Math.round(vectorFraction * 100);

  const vectorWeight = totalVectorRecords;
  const rasterWeight = totalRasterLayers * Math.max(aoiAreaKm2!, 1);

  return Math.round(((vectorFraction * vectorWeight + rasterFraction * rasterWeight) / (vectorWeight + rasterWeight)) * 100);
}

export function validateFileFormats(
  formats: string[],
  vectorRequested: boolean,
  rasterRequested: boolean,
): { vectorFormat: VectorFileFormat | null; rasterFormat: RasterFileFormat | null } {
  const validVectorFormats = Object.values(VectorFileFormat) as string[];
  const validRasterFormats = Object.values(RasterFileFormat) as string[];

  let vectorFormat: VectorFileFormat | null = null;
  let rasterFormat: RasterFileFormat | null = null;

  for (const fmt of formats) {
    if (!vectorFormat && validVectorFormats.includes(fmt)) vectorFormat = fmt as VectorFileFormat;
    if (!rasterFormat && validRasterFormats.includes(fmt)) rasterFormat = fmt as RasterFileFormat;
  }

  if (vectorRequested && !vectorFormat) {
    throw new Error(`No valid vector format in [${formats.join(', ')}]. Valid: ${validVectorFormats.join(', ')}`);
  }

  // GPKG appears in both enums; if the user picked 'gpkg' it covers raster too.
  // For any other vector-only format, default raster to TIFF.
  if (rasterRequested && !rasterFormat) {
    rasterFormat = RasterFileFormat.TIFF;
  }

  return { vectorFormat, rasterFormat };
}
