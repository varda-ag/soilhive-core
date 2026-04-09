// src/jobs/soil-export/services.ts

import { EntityManager } from 'typeorm';
import FilterService from '../../services/FilterService';
import SoilDataStorage from '../../data-layer/SoilDataStorage';
import { SoilDataSample } from '../../interfaces/SoilDataSample';
import { RequestData } from '../../interfaces/RequestData';
import { SoilExportJobPayload, GroupedRecords, EXPORT_CONFIG, soilSampleToExportRecord } from './types';

import * as fs from 'fs';
import * as path from 'path';

export async function getTotalRecordsCount(entityManager: EntityManager, payload: SoilExportJobPayload): Promise<number> {
  const requestData: RequestData = {
    entityManager,
    token: {} as any,
  };

  const filterService = new FilterService();

  const storedFilter = await filterService.getFilterById(requestData, payload.filterId);

  const soilDataStorage = new SoilDataStorage();

  return await soilDataStorage.getSoilDataCount(entityManager, storedFilter.filter, payload.dataset_ids);
}

/**
 * Fetch a batch of soil data samples
 * @param entityManager - TypeORM entity manager
 * @param payload - Job payload
 * @param cursor - Pagination cursor (undefined for first batch)
 * @returns Array of soil data samples
 */
export async function fetchBatch(entityManager: EntityManager, payload: SoilExportJobPayload, cursor?: string): Promise<SoilDataSample[]> {
  const requestData: RequestData = {
    entityManager,
    token: {} as any,
  };

  const filterService = new FilterService();

  const storedFilter = await filterService.getFilterById(requestData, payload.filterId);

  const soilDataStorage = new SoilDataStorage();

  return await soilDataStorage.getSoilData(
    entityManager,
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
