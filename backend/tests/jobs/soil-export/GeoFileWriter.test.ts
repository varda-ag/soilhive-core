import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import * as gdal from 'gdal-async';
import { GeoFileWriter } from '../../../src/jobs/soil-export/GeoFileWriter';
import { EXPORT_SCHEMA, FileFormat, soilSampleToExportRecord } from '../../../src/jobs/soil-export/types';
import { SoilDataSample } from '../../../src/interfaces/SoilDataSample';

const TEST_OUTPUT_DIR = path.join(__dirname, 'output');

function makeSample(overrides: Partial<SoilDataSample> = {}): SoilDataSample {
  return {
    id: 'test-id-1',
    dataset_id: 'dataset-1',
    dataset_name: 'Test Dataset',
    soil_property: 'Aluminum',
    property_acronym: 'Al',
    standard_unit: 'mg/kg',
    value: 42.5,
    geometry: { type: 'Point', coordinates: [-124.1303482, 40.4684982] },
    license_name: 'CC-BY-4.0',
    sampling_date: '2023-01-15',
    min_depth: 0,
    max_depth: 30,
    // horizon: 'A',
    sample_pretreatment: 'air-dried',
    technique: 'ICP-OES',
    laboratory_method: null,
    extractant_concentration: '0.01M',
    extraction_ratio: '1:10',
    extraction_base: 'water',
    measurement_procedure: null,
    limit_of_detection: '0.1',
    cursor: 'cursor-1',
    ...overrides,
  };
}

/**
 * For single-file formats (XLSX, GPKG, SHP) the output is one file.
 * For multi-file formats (CSV, GeoJSON) each property gets its own file.
 * This helper returns the path GDAL should open for verification.
 */
function getVerificationPath(format: FileFormat, propertyAcronym: string): string {
  switch (format) {
    case FileFormat.CSV:
      return path.join(TEST_OUTPUT_DIR, `${propertyAcronym}.csv`);
    case FileFormat.GEOJSON:
      return path.join(TEST_OUTPUT_DIR, `${propertyAcronym}.geojson`);
    case FileFormat.XLSX:
      return path.join(TEST_OUTPUT_DIR, 'export.xlsx');
    case FileFormat.GPKG:
      return path.join(TEST_OUTPUT_DIR, 'export.gpkg');
    case FileFormat.SHP:
      return path.join(TEST_OUTPUT_DIR, `${propertyAcronym}.shp`);
  }
}

const ALL_FORMATS: FileFormat[] = [FileFormat.CSV, FileFormat.XLSX, FileFormat.GPKG, FileFormat.SHP, FileFormat.GEOJSON];

describe('GeoFileWriter', () => {
  beforeAll(() => {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  // Clean output dir between tests to avoid cross-format interference
  // Note: if you want to inspect output files, comment out afterEach
  afterEach(() => {
    fs.readdirSync(TEST_OUTPUT_DIR).forEach((file: any) => fs.rmSync(path.join(TEST_OUTPUT_DIR, file), { recursive: true }));
  });

  describe('single property across two batches', () => {
    it.each(ALL_FORMATS)('%s: should write 2 records then append 2 more resulting in 4 records total', async format => {
      const writer = new GeoFileWriter(format);

      // --- Batch 1: write 2 records ---
      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty('Al');
      for (const sample of [
        makeSample({ id: '1', value: 10.1, cursor: 'cursor-1' }),
        makeSample({ id: '2', value: 20.2, cursor: 'cursor-2' }),
      ]) {
        await writer.writeRecord(soilSampleToExportRecord(sample));
      }
      await writer.closeFile();

      // --- Batch 2: append 2 more records ---
      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty('Al');
      for (const sample of [
        makeSample({ id: '3', value: 30.3, cursor: 'cursor-3' }),
        makeSample({ id: '4', value: 40.4, cursor: 'cursor-4' }),
      ]) {
        await writer.writeRecord(soilSampleToExportRecord(sample));
      }
      await writer.closeFile();

      // --- Verify ---
      const dataset = gdal.open(getVerificationPath(format, 'Al'), 'r');
      const layer = dataset.layers.get('Al');

      expect(layer).toBeDefined();
      expect(layer.features.count()).toBe(4);

      const values: number[] = [];
      layer.features.forEach(feature => {
        const value = feature.fields.get('value');
        values.push(typeof value === 'string' ? parseFloat(value) : (value as number));
      });
      expect(values).toEqual(expect.arrayContaining([10.1, 20.2, 30.3, 40.4]));

      dataset.close();
    });
  });

  describe('two properties across two batches', () => {
    it.each(ALL_FORMATS)('%s: should write Al and Ca records to separate layers/sheets/files without cross-contamination', async format => {
      const writer = new GeoFileWriter(format);

      // --- Batch 1: mixed Al and Ca records ---
      await writer.openFile(TEST_OUTPUT_DIR);

      await writer.setProperty('Al');
      for (const sample of [
        makeSample({ id: '1', soil_property: 'Aluminum', property_acronym: 'Al', value: 10.1, cursor: 'cursor-1' }),
        makeSample({ id: '2', soil_property: 'Aluminum', property_acronym: 'Al', value: 20.2, cursor: 'cursor-2' }),
      ]) {
        await writer.writeRecord(soilSampleToExportRecord(sample));
      }

      await writer.setProperty('Ca');
      for (const sample of [
        makeSample({ id: '3', soil_property: 'Calcium', property_acronym: 'Ca', value: 55.5, cursor: 'cursor-3' }),
        makeSample({ id: '4', soil_property: 'Calcium', property_acronym: 'Ca', value: 66.6, cursor: 'cursor-4' }),
      ]) {
        await writer.writeRecord(soilSampleToExportRecord(sample));
      }

      await writer.closeFile();

      // --- Batch 2: append to both properties ---
      await writer.openFile(TEST_OUTPUT_DIR);

      await writer.setProperty('Al');
      await writer.writeRecord(
        soilSampleToExportRecord(
          makeSample({ id: '5', soil_property: 'Aluminum', property_acronym: 'Al', value: 30.3, cursor: 'cursor-5' }),
        ),
      );

      await writer.setProperty('Ca');
      await writer.writeRecord(
        soilSampleToExportRecord(
          makeSample({ id: '6', soil_property: 'Calcium', property_acronym: 'Ca', value: 77.7, cursor: 'cursor-6' }),
        ),
      );

      await writer.closeFile();

      // --- Verify Al ---
      const alDataset = gdal.open(getVerificationPath(format, 'Al'), 'r');
      const alLayer = alDataset.layers.get('Al');

      expect(alLayer).toBeDefined();
      expect(alLayer.features.count()).toBe(3);

      const alValues: number[] = [];
      alLayer.features.forEach(feature => {
        const value = feature.fields.get('value');
        alValues.push(typeof value === 'string' ? parseFloat(value) : (value as number));
      });
      expect(alValues).toEqual(expect.arrayContaining([10.1, 20.2, 30.3]));

      alDataset.close();

      // --- Verify Ca ---
      // For single-file formats Ca is in the same file, for multi-file formats it's a separate file
      const caDataset = gdal.open(getVerificationPath(format, 'Ca'), 'r');
      const caLayer = caDataset.layers.get('Ca');

      expect(caLayer).toBeDefined();
      expect(caLayer.features.count()).toBe(3);

      const caValues: number[] = [];
      caLayer.features.forEach(feature => {
        const value = feature.fields.get('value');
        caValues.push(typeof value === 'string' ? parseFloat(value) : (value as number));
      });
      expect(caValues).toEqual(expect.arrayContaining([55.5, 66.6, 77.7]));

      caDataset.close();

      // --- Verify no cross-contamination ---
      expect(alValues).not.toEqual(expect.arrayContaining([55.5, 66.6, 77.7]));
      expect(caValues).not.toEqual(expect.arrayContaining([10.1, 20.2, 30.3]));
    });
  });

  describe('ESRI Shapefile field name truncation', () => {
    it('should use truncated field names for SHP format to comply with 10-character limit', async () => {
      // We only care about SHP for this specific logic
      const format = FileFormat.SHP;
      const writer = new GeoFileWriter(format);
      const property = 'Al';

      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty(property);

      // Write a sample record
      const sample = makeSample({ id: '1', property_acronym: property });
      await writer.writeRecord(soilSampleToExportRecord(sample));
      await writer.closeFile();

      // Verify via GDAL
      const dataset = gdal.open(getVerificationPath(format, property), 'r');
      const layer = dataset.layers.get(0);

      // Get all field names currently in the SHP file
      const actualFieldNames: string[] = [];
      for (let i = 0; i < layer.fields.count(); i++) {
        actualFieldNames.push(layer.fields.get(i).name);
      }

      // Check against EXPORT_SCHEMA
      // For SHP, every field name in the file should match field.title_truncated
      EXPORT_SCHEMA.forEach(field => {
        // 'geom' is handled as geometry, not a field, in SHP
        if (field.key !== 'geom') {
          expect(actualFieldNames).toContain(field.title_truncated);
          // Also verify it did NOT use the full title if they are different
          if (field.title !== field.title_truncated) {
            expect(actualFieldNames).not.toContain(field.title);
          }
        }
      });

      dataset.close();
    });
  });
});
