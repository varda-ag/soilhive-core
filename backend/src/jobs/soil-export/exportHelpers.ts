import SoilDataStorage from '../../data-layer/SoilDataStorage';
import { RequestData } from '../../interfaces/RequestData';
import { SoilDataSample } from '../../interfaces/SoilDataSample';
import FilterService from '../../services/FilterService';
import { EXPORT_CONFIG, GroupedRecords, SoilExportJobPayload, soilSampleToExportRecord } from './types';

import * as fs from 'fs';
import * as path from 'path';

const filterService = new FilterService();
const soilDataStorage = new SoilDataStorage();

export async function getTotalRecordsCount(requestData: RequestData, payload: SoilExportJobPayload): Promise<number> {
  const storedFilter = await filterService.getFilterById(requestData, payload.filterId);
  return await soilDataStorage.getSoilDataCount(requestData, storedFilter.filter, payload.dataset_ids);
}

/**
 * Fetch a batch of soil data samples
 * @param requestData - RequestData containing user and entity manager information
 * @param payload - Job payload
 * @param cursor - Pagination cursor (undefined for first batch)
 * @returns Array of soil data samples
 */
export async function fetchBatch(requestData: RequestData, payload: SoilExportJobPayload, cursor?: string): Promise<SoilDataSample[]> {
  const storedFilter = await filterService.getFilterById(requestData, payload.filterId);
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

/**
 * Create README file with export information
 * @param tempDir - Temporary directory path
 * @param payload - Job payload
 */
export async function createReadmeFile(tempDir: string, payload: SoilExportJobPayload): Promise<void> {
  // TODO: Implement README generation with export details
  // For now, create placeholder
  const readmePath = path.join(tempDir, 'README.txt');
  const content = `
Soil Data Export
================

Filter ID: ${payload.filterId}
Datasets: ${payload.dataset_ids.join(', ')}
Format: ${payload.file_format}
Export Date: ${new Date().toISOString()}

This export contains soil data organized by soil property.
Each file/sheet/layer represents a different soil property (identified by property acronym).
  `.trim();

  await fs.promises.writeFile(readmePath, content, 'utf-8');
}
