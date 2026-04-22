import * as path from 'path';
import { Readable } from 'stream';
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
import { EXPORT_CONFIG, GroupedRecords, soilSampleToExportRecord } from './types';
import { getEntities } from '../../utils/slugs';
import DatasetEntity from '../../entities/Dataset';
import { EntityType } from '../../types/data';
import { ExportJobParameters } from '../../interfaces/Job';
import { FilterCriteria } from '../../interfaces/DatasetFilter';

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
  return await soilDataStorage.getSoilData(
    requestData,
    storedFilter.filter,
    payload.dataset_ids,
    EXPORT_CONFIG.BATCH_SIZE,
    cursor,
    undefined,
  );
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
  }));

  const filterEntity = await filterService.getFilterById(requestData, payload.filter_id);
  const filter = await getFilterString(requestData, filterEntity.filter.parameters);

  await generateExportPdf({
    outputPath: readmePath,
    datasets: datasetPdfInfo,
    filter,
    logoBuffer,
    fileFormat: payload.format,
    exportDate: new Date(),
    homepageUrl: payload.public_homepage_url,
    termsUrl: payload.public_terms_url,
  });
}
