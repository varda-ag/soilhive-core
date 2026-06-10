import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import extractZip from 'extract-zip';
import request from 'supertest';
import { app } from '../../../src/app';
import { addDataset, addSyntheticData, syntheticDataOptions, addRasterData } from '../../../src/utils/mock';
import { initPgBoss, stopPgBoss } from '../../../src/services/PgBoss';
import { getExportBatchSize, sanitizeField, sleep } from '../../../src/utils/utils';
import { RasterFileFormat, VectorFileFormat } from '../../../src/jobs/soil-export/types';
import { StatusCodes } from 'http-status-codes';
import { SoilDataSample } from '../../../src/interfaces/SoilDataSample';
import * as exportHelpers from '../../../src/jobs/soil-export/exportHelpers';
import DatasetEntity from '../../../src/entities/Dataset';
import RasterLayerEntity from '../../../src/entities/RasterLayer';
import { GdalCLI } from '../../../src/utils/GdalCLI';
import { IngestionStatus } from '../../../src/types/data';

const storageRoot = process.env.LOCAL_STORAGE_ROOT_FOLDER!;

describe('Soil Export Job Integration Test', () => {
  beforeAll(async () => {
    const rasterAssetsDir = path.join(__dirname, '../../assets/raster');
    fs.cpSync(rasterAssetsDir, storageRoot, { recursive: true });
    await initPgBoss();
    await sleep(2000); // Wait for pg-boss table to be ready
  });

  afterAll(async () => {
    await stopPgBoss();
    for (const entry of fs.readdirSync(storageRoot)) {
      fs.rmSync(path.join(storageRoot, entry), { recursive: true, force: true });
    }
  });

  describe('Raster and vector datasets', () => {
    const filterPolygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-80.817984705196, -33.783002865481436],
          [-80.76723043805315, -33.783002865481436],
          [-80.76723043805315, -33.74798702332339],
          [-80.817984705196, -33.74798702332339],
          [-80.817984705196, -33.783002865481436],
        ],
      ],
    };
    let dataset: DatasetEntity | null = null;
    let raster_layer: RasterLayerEntity | null = null;

    beforeEach(async () => {
      raster_layer = await addRasterData(undefined, {
        visibility: 'public',
        dataset_status: IngestionStatus.PUBLISHED,
      });
      ({ dataset } = await addSyntheticData({
        ...syntheticDataOptions,
        id: 200,
        depthLayers: 1,
        featureCount: 2,
        observationsPerLayer: 2,
        soilPropertyNames: ['aluminum', 'calcium'],
        featureCoordinates: [
          [-80.8013337, -33.759169],
          [-80.7786728, -33.772006],
        ],
        spatial_extent: [-81, -34, -79, -32],
      }));
    }, 10000);

    it('vector dataset - should create observations, queue export job, wait for completion, download and verify file', async () => {
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
          dataset_ids: [dataset!.slug],
          formats: [VectorFileFormat.CSV],
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
        .get(`/downloads/${escapedDownloadPath}`)
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
        expect(csvContent.toLowerCase()).toContain(dataset!.slug.toLowerCase());
      }

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 6000); // 6 seconds timeout for integration test

    it('should create one output file with one band and one vector layer when format requested is GPKG', async () => {
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
          dataset_ids: [dataset?.slug, raster_layer?.dataset.slug],
          formats: [VectorFileFormat.GPKG],
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
        .get(`/downloads/${escapedDownloadPath}`)
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

      // Find GPKG file
      const gpkgFiles = extractedFiles.filter((file: string) => file.toLowerCase().endsWith('.gpkg'));
      expect(gpkgFiles.length).toBe(1);

      // Verify GPKG content contains expected data
      const rasterInfo = await GdalCLI.gdalinfo(path.join(extractDir, gpkgFiles[0]));
      expect(rasterInfo.bands?.length).toBeGreaterThan(0);
      expect(rasterInfo.metadata!['']!.IDENTIFIER).toContain(sanitizeField(raster_layer!.dataset.name));
      expect(rasterInfo.metadata!['']!.IDENTIFIER).toContain(sanitizeField(raster_layer!.soil_property.property_name));

      const vectorInfo = await GdalCLI.ogrinfo(path.join(extractDir, gpkgFiles[0]));
      expect(vectorInfo.layers.length).toBeGreaterThan(0);

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 8000);

    it('should create several output files with the corresponding formats when several are requested', async () => {
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
          dataset_ids: [dataset?.slug, raster_layer?.dataset.slug],
          formats: [VectorFileFormat.CSV, RasterFileFormat.TIFF],
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
        .get(`/downloads/${escapedDownloadPath}`)
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

      // Find TIFF files
      const tiffFiles = extractedFiles.filter((file: string) => file.toLowerCase().endsWith('.tif'));
      expect(tiffFiles.length).toBeGreaterThan(0);

      // Verify output content contains expected data
      const rasterInfo = await GdalCLI.gdalinfo(path.join(extractDir, tiffFiles[0]));
      expect(rasterInfo.bands?.length).toBeGreaterThan(0);

      const csvPath = path.join(extractDir, csvFiles[0]);
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      expect(csvContent).toBeTruthy();
      expect(csvContent.length).toBeGreaterThan(0);

      // Check for expected headers/columns
      const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(1); // Header + at least one data row

      // Verify it contains dataset name
      expect(csvContent.toLowerCase()).toContain(dataset!.slug.toLowerCase());

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 8000);

    it('should create one output file with several bands when several raster datasets requested with format GPKG', async () => {
      const extra_raster_layer = await addRasterData(path.join(__dirname, '../../assets/raster/bdod_5-15cm_mean.tif'), {
        dataset: 'test-raster-ds-2',
        visibility: 'public',
        dataset_status: IngestionStatus.PUBLISHED,
      });
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
          dataset_ids: [raster_layer?.dataset.slug, extra_raster_layer.dataset.slug],
          formats: [RasterFileFormat.GPKG],
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
        .get(`/downloads/${escapedDownloadPath}`)
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

      // Find GPKG files
      const gpkgFiles = extractedFiles.filter((file: string) => file.toLowerCase().endsWith('.gpkg'));
      expect(gpkgFiles.length).toBe(1);

      // Verify GPKG content contains expected data
      const rasterInfo = await GdalCLI.gdalinfo(path.join(extractDir, gpkgFiles[0]));
      expect(rasterInfo.metadata?.SUBDATASETS).toHaveProperty('SUBDATASET_1_NAME');
      expect(rasterInfo.metadata?.SUBDATASETS).toHaveProperty('SUBDATASET_2_NAME');
      expect(Object.values(rasterInfo.metadata?.SUBDATASETS ?? {})).toEqual(
        expect.arrayContaining([
          expect.stringContaining(sanitizeField(raster_layer!.dataset.name)),
          expect.stringContaining(sanitizeField(extra_raster_layer.dataset.name)),
        ]),
      );

      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 8000);
  });

  it('should stop processing and not produce a download_path when job is cancelled mid-run', async () => {
    const fakeRecord: SoilDataSample = {
      id: 'fake-id',
      dataset_id: 'fake-dataset-id',
      dataset_name: 'fake-dataset',
      soil_property: 'aluminum',
      property_acronym: 'AL',
      property_name: 'aluminum',
      standard_unit: null,
      value: 1.0,
      geometry: { type: 'Point', coordinates: [0, 0] },
      license_name: null,
      sampling_date: null,
      min_depth: null,
      max_depth: null,
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

    await addDataset('fake-dataset', [0, 0, 1, 1]);

    const fetchBatchSpy = jest.spyOn(exportHelpers, 'fetchBatch').mockResolvedValue(Array(getExportBatchSize()).fill(fakeRecord));
    const getTotalRecordsCountSpy = jest.spyOn(exportHelpers, 'getTotalRecordsCount').mockResolvedValue(1000);
    const createReadmeFileSpy = jest.spyOn(exportHelpers, 'createReadmeFile').mockResolvedValue(undefined);

    // 2. Queue export job (no real data needed)
    const exportJobResponse = await request(app)
      .post('/jobs')
      .send({
        type: 'export',
        filter_id: '3b0fab67-f73c-4cc7-b97f-2c688212f7b0',
        dataset_ids: ['fake-dataset'],
        formats: [VectorFileFormat.CSV],
      });

    expect(exportJobResponse.statusCode).toBe(StatusCodes.CREATED);
    const jobId = exportJobResponse.body.id;

    // 3. Poll until job has processed at least one batch before cancelling
    let started = false;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const s = await request(app).get(`/jobs/${jobId}`);
      if ((s.body.data?.total_records_processed ?? 0) > 0) {
        started = true;
        break;
      }
    }
    expect(started).toBe(true); // job must have processed something before we cancel

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
    createReadmeFileSpy.mockRestore();
  }, 15000);
});
