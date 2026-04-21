import * as path from 'path';
import { Readable } from 'stream';
import SoilDataStorage from '../../data-layer/SoilDataStorage';
import { JsonStorage } from '../../entities/JsonStorage';
import { RequestData } from '../../interfaces/RequestData';
import { SoilDataSample } from '../../interfaces/SoilDataSample';
import ConfigService from '../../services/ConfigService';
import FileService from '../../services/FileService';
import FilterService from '../../services/FilterService';
import { generateExportPdf } from './pdfGenerator';
import { EXPORT_CONFIG, GroupedRecords, soilSampleToExportRecord } from './types';
import { getEntities } from '../../utils/slugs';
import DatasetEntity from '../../entities/Dataset';
import { EntityType } from '../../types/data';
import { ExportJobParameters } from '../../interfaces/Job';

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
    url: payload.public_metadata_url ? `${payload.public_metadata_url}/${ds.slug}` : undefined,
  }));

  await generateExportPdf({
    outputPath: readmePath,
    datasets: datasetPdfInfo,
    logoBuffer,
    fileFormat: payload.format,
    exportDate: new Date(),
    homepageUrl: payload.public_homepage_url,
    termsUrl: payload.public_terms_url,
  });
}
