import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import extractZip from 'extract-zip';
import request from 'supertest';
import { app } from '../../../src/app';
import { addSyntheticData, syntheticDataOptions } from '../../../src/utils/mock';
import { initPgBoss, stopPgBoss } from '../../../src/services/PgBoss';
import { sleep } from '../../../src/utils/utils';
import { EXPORT_CONFIG, FileFormat } from '../../../src/jobs/soil-export/types';
import { StatusCodes } from 'http-status-codes';
import { SoilDataSample } from '../../../src/interfaces/SoilDataSample';
import * as exportHelpers from '../../../src/jobs/soil-export/exportHelpers';

describe('Soil Export Job Integration Test', () => {
  beforeAll(async () => {
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss table to be ready
  });

  afterAll(async () => {
    await stopPgBoss();
  });

  it('should create observations, queue export job, wait for completion, download and verify file', async () => {
    // 1. Create synthetic data with observations
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 200,
      depthLayers: 1,
      featureCount: 2,
      observationsPerLayer: 2,
      soilPropertyNames: ['aluminum', 'calcium'],
      featureCoordinates: [
        [-124.13, 40.47],
        [-124.14, 40.48],
      ],
    });

    // 2. Create a filter that matches the observations
    // Use a polygon that encompasses the feature coordinates
    const filterPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-124.15, 40.46],
          [-124.12, 40.46],
          [-124.12, 40.49],
          [-124.15, 40.49],
          [-124.15, 40.46],
        ],
      ],
    };

    const filterResponse = await request(app)
      .post('/data-filters')
      .send({
        geometries: [filterPolygon],
        parameters: {},
      });

    expect(filterResponse.statusCode).toBe(201);
    const filterId = filterResponse.body.id;
    expect(filterId).toBeDefined();

    // 3. Queue an export job via API
    const exportJobResponse = await request(app)
      .post('/jobs')
      .send({
        type: 'export',
        filter_id: filterId,
        dataset_slugs: [dataset.slug],
        format: FileFormat.CSV,
      });

    expect(exportJobResponse.statusCode).toBe(201);
    const jobId = exportJobResponse.body.id;
    expect(jobId).toBeDefined();

    // 4. Poll for job completion
    let jobStatus = 'created';
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 60 seconds
    let completedJob: any;

    while (jobStatus !== 'completed' && attempts < maxAttempts) {
      await sleep(1000); // Wait 1 second between polls
      attempts++;

      const statusResponse = await request(app).get(`/jobs/${jobId}`);
      expect(statusResponse.statusCode).toBe(200);

      completedJob = statusResponse.body;
      jobStatus = completedJob.status;

      // If job failed, throw error
      if (jobStatus === 'failed') {
        throw new Error(`Job failed: ${JSON.stringify(completedJob)}`);
      }
    }

    expect(jobStatus).toBe('completed');
    expect(completedJob.data.download_path).toBeDefined();
    expect(completedJob.data.progress_percentage).toBe(100);

    // 5. Download the file
    const downloadPath = completedJob.data.download_path;
    // The API expects path separators to be encoded as %2F
    const escapedDownloadPath = downloadPath.replace(/\//g, '%2F');

    const downloadResponse = await request(app)
      .get(`/download/${escapedDownloadPath}`)
      .buffer()
      // Explicitly tell SuperTest NOT to parse this as JSON/Object
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          callback(null, Buffer.from(data, 'binary'));
        });
      });

    expect(downloadResponse.statusCode).toBe(StatusCodes.OK);

    // 6. Save and verify the zip file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
    const zipPath = path.join(tempDir, 'export.zip');

    fs.writeFileSync(zipPath, downloadResponse.body);

    // Verify zip file exists and is not empty
    expect(fs.existsSync(zipPath)).toBe(true);
    const stats = fs.statSync(zipPath);
    expect(stats.size).toBeGreaterThan(0);

    // Extract and verify contents
    const extractDir = path.join(tempDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, { dir: extractDir });

    // List extracted files (zip should contain files at root level)
    const extractedFiles = fs.readdirSync(extractDir);
    expect(extractedFiles.length).toBeGreaterThan(0);

    // Should contain at least a README file
    const readmeFile = extractedFiles.find((file: string) => file.toLowerCase().includes('readme'));
    expect(readmeFile).toBeDefined();

    // Find CSV files (should have files for each property)
    const csvFiles = extractedFiles.filter((file: string) => file.toLowerCase().endsWith('.csv'));
    expect(csvFiles.length).toBeGreaterThan(0);

    // Verify CSV content contains expected data
    for (const csvFile of csvFiles) {
      const csvPath = path.join(extractDir, csvFile as string);
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      expect(csvContent).toBeTruthy();
      expect(csvContent.length).toBeGreaterThan(0);

      // Check for expected headers/columns
      const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(1); // Header + at least one data row

      // Verify it contains dataset name
      expect(csvContent.toLowerCase()).toContain(dataset.slug.toLowerCase());
    }

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  }, 6000); // 6 seconds timeout for integration test

  it('should stop processing and not produce a download_path when job is cancelled mid-run', async () => {
    const fakeRecord: SoilDataSample = {
      id: 'fake-id',
      dataset_id: 'fake-dataset-id',
      dataset_name: 'fake-dataset',
      soil_property: 'aluminum',
      property_acronym: 'AL',
      standard_unit: null,
      value: 1.0,
      geometry: { type: 'Point', coordinates: [0, 0] },
      license_name: null,
      sampling_date: null,
      min_depth: null,
      max_depth: null,
      horizon: null,
      sample_pretreatment: null,
      technique: null,
      laboratory_method: null,
      extractant_concentration: null,
      extraction_ratio: null,
      extraction_base: null,
      measurement_procedure: null,
      limit_of_detection: null,
      cursor: 'fake-cursor',
    };

    const fetchBatchSpy = jest.spyOn(exportHelpers, 'fetchBatch').mockResolvedValue(Array(EXPORT_CONFIG.BATCH_SIZE).fill(fakeRecord));

    const getTotalRecordsCountSpy = jest.spyOn(exportHelpers, 'getTotalRecordsCount').mockResolvedValue(1000);

    // 2. Queue export job (no real data needed)
    const exportJobResponse = await request(app)
      .post('/jobs')
      .send({
        type: 'export',
        filter_id: 'fake-filter-id',
        dataset_slugs: ['fake-dataset'],
        format: FileFormat.CSV,
      });

    expect(exportJobResponse.statusCode).toBe(StatusCodes.CREATED);
    const jobId = exportJobResponse.body.id;

    // 3. Wait briefly to ensure job has started processing
    await sleep(2000);

    // 4. Cancel the job via API
    const cancelResponse = await request(app).delete(`/jobs/${jobId}`);
    expect(cancelResponse.statusCode).toBe(StatusCodes.NO_CONTENT);

    // 5. Wait briefly for the cancellation to be detected in the next loop iteration
    await sleep(2000);

    // 6. Verify job has no download_path
    const statusResponse = await request(app).get(`/jobs/${jobId}`);
    expect(statusResponse.statusCode).toBe(StatusCodes.OK);
    const recordsProcessedAtCancel = statusResponse.body.data.total_records_processed;
    expect(recordsProcessedAtCancel).toBeGreaterThan(0); // job did some work

    // 7. Wait a bit more and verify total_records_processed has not increased
    await sleep(1000);

    const statusFinal = await request(app).get(`/jobs/${jobId}`);
    expect(statusFinal.statusCode).toBe(StatusCodes.OK);
    expect(statusFinal.body.data.total_records_processed).toBe(recordsProcessedAtCancel);
    expect(statusFinal.body.data.download_path).toBeUndefined();

    fetchBatchSpy.mockRestore();
    getTotalRecordsCountSpy.mockRestore();
  }, 7000);
});
