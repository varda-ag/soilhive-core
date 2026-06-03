import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';
import { GeoFileWriter } from '../../../src/jobs/soil-export/GeoFileWriter';
import { EXPORT_SCHEMA, FileFormat, soilSampleToExportRecord } from '../../../src/jobs/soil-export/types';
import { SoilDataSample } from '../../../src/interfaces/SoilDataSample';
import { GdalCLI } from '../../../src/utils/GdalCLI';

const TEST_OUTPUT_DIR = path.join(__dirname, 'output');

function makeSample(overrides: Partial<SoilDataSample> = {}): SoilDataSample {
  return {
    id: 'test-id-1',
    dataset_id: 'dataset-1',
    dataset_name: 'Test Dataset',
    soil_property: 'Aluminum',
    property_acronym: 'Al',
    property_name: 'Aluminum',
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

function stripQuotes(s: string): string {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}

/**
 * For single-file formats (XLSX, GPKG, SHP) the output is one file.
 * For multi-file formats (CSV, GeoJSON) each property gets its own file.
 * This helper returns the path ogr2ogr/ogrinfo should open for verification.
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

/**
 * Convert the output file (or layer within it) to a temp CSV and return rows.
 * For single-file formats with multiple layers, pass propertyAcronym to select the layer.
 */
async function readLayerRows(
  format: FileFormat,
  propertyAcronym: string,
): Promise<{ rows: Record<string, string>[]; fieldNames: string[] }> {
  const filePath = getVerificationPath(format, propertyAcronym);
  const csvPath = path.join(TEST_OUTPUT_DIR, `_verify_${propertyAcronym}_${format}.csv`);

  const isSpatial = !TABULAR_FORMATS.includes(format);
  const args = ['-f', 'CSV'];
  if (isSpatial) args.push('-lco', 'GEOMETRY=AS_WKT');
  args.push(csvPath, filePath);
  if (format === FileFormat.GPKG || format === FileFormat.XLSX) {
    args.push(propertyAcronym);
  }
  await GdalCLI.ogr2ogr(args);

  const csv = fs.readFileSync(csvPath, 'utf-8').trim();
  fs.unlinkSync(csvPath);

  const lines = csv.split('\n');
  const fieldNames = lines[0].split(',').map(h => stripQuotes(h.trim()));
  const rows = lines.slice(1).map(line => {
    const cols = line.split(',');
    return Object.fromEntries(fieldNames.map((h, i) => [h, stripQuotes((cols[i] ?? '').trim())]));
  });

  return { rows, fieldNames };
}

const ALL_FORMATS: FileFormat[] = [FileFormat.CSV, FileFormat.XLSX, FileFormat.GPKG, FileFormat.SHP, FileFormat.GEOJSON];
const SPATIAL_FORMATS: FileFormat[] = [FileFormat.GPKG, FileFormat.SHP, FileFormat.GEOJSON];
const TABULAR_FORMATS: FileFormat[] = [FileFormat.CSV, FileFormat.XLSX];

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
      const { rows } = await readLayerRows(format, 'Al');

      expect(rows).toHaveLength(4);

      const values = rows.map(r => parseFloat(r['value']));
      expect(values).toEqual(expect.arrayContaining([10.1, 20.2, 30.3, 40.4]));
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
      const { rows: alRows } = await readLayerRows(format, 'Al');

      expect(alRows).toHaveLength(3);
      const alValues = alRows.map(r => parseFloat(r['value']));
      expect(alValues).toEqual(expect.arrayContaining([10.1, 20.2, 30.3]));

      // --- Verify Ca ---
      const { rows: caRows } = await readLayerRows(format, 'Ca');

      expect(caRows).toHaveLength(3);
      const caValues = caRows.map(r => parseFloat(r['value']));
      expect(caValues).toEqual(expect.arrayContaining([55.5, 66.6, 77.7]));

      // --- Verify no cross-contamination ---
      expect(alValues).not.toEqual(expect.arrayContaining([55.5, 66.6, 77.7]));
      expect(caValues).not.toEqual(expect.arrayContaining([10.1, 20.2, 30.3]));
    });
  });

  describe('precondition: setProperty required before writeRecord', () => {
    it('should throw if writeRecord is called without a prior setProperty', async () => {
      const writer = new GeoFileWriter(FileFormat.CSV);
      await writer.openFile(TEST_OUTPUT_DIR);
      await expect(writer.writeRecord(soilSampleToExportRecord(makeSample()))).rejects.toThrow(
        'GeoFileWriter: No active layer. Call setProperty() first.',
      );
    });
  });

  describe('empty batch', () => {
    it('should not create any output files when a property has no records', async () => {
      const writer = new GeoFileWriter(FileFormat.CSV);
      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty('Al');
      await writer.closeFile();
      expect(fs.readdirSync(TEST_OUTPUT_DIR)).toHaveLength(0);
    });
  });

  describe('geometry in spatial formats', () => {
    it.each(SPATIAL_FORMATS)('%s: should write Point geometry with correct coordinates', async format => {
      const writer = new GeoFileWriter(format);
      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty('Al');
      await writer.writeRecord(soilSampleToExportRecord(makeSample({ id: '1' })));
      await writer.closeFile();

      const { rows } = await readLayerRows(format, 'Al');
      expect(rows).toHaveLength(1);
      // ogr2ogr emits geometry as WKT when converting to CSV (-lco GEOMETRY=AS_WKT).
      // The column name varies by source format (e.g. 'WKT' for SHP/GeoJSON, 'geom' for GPKG),
      // so we locate the geometry value by searching for the POINT prefix.
      const wkt = Object.values(rows[0]).find(v => v.startsWith('POINT'));
      expect(wkt).toMatch(/POINT \(-124\.1303482 40\.4684982\)/);
    });
  });

  describe('geom as text column in tabular formats', () => {
    it.each(TABULAR_FORMATS)('%s: should include geom as a WKT text column', async format => {
      const writer = new GeoFileWriter(format);
      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty('Al');
      await writer.writeRecord(soilSampleToExportRecord(makeSample({ id: '1' })));
      await writer.closeFile();

      const { rows, fieldNames } = await readLayerRows(format, 'Al');
      expect(fieldNames).toContain('geom');
      expect(rows[0]['geom']).toMatch(/POINT \(-124\.1303482 40\.4684982\)/);
      // tabular formats have null geometry — no WKT geometry column from ogr2ogr
      expect(fieldNames).not.toContain('WKT');
    });
  });

  describe('all EXPORT_SCHEMA fields present in output', () => {
    it.each(ALL_FORMATS)('%s: should emit all schema field names and round-trip values correctly', async format => {
      const isTabular = TABULAR_FORMATS.includes(format);
      const writer = new GeoFileWriter(format);
      // laboratory_method is null in the default sample factory
      const sample = makeSample({ id: '1' });

      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty('Al');
      await writer.writeRecord(soilSampleToExportRecord(sample));
      await writer.closeFile();

      const { rows, fieldNames } = await readLayerRows(format, 'Al');

      EXPORT_SCHEMA.forEach(field => {
        if (field.key === 'geom' && !isTabular) return; // geometry in spatial formats, not a property column
        const name = format === FileFormat.SHP ? field.title_truncated : field.title;
        expect(fieldNames).toContain(name);
      });

      const nameFor = (title: string, truncated: string) => (format === FileFormat.SHP ? truncated : title);

      expect(rows[0][nameFor('dataset_name', 'dataset')]).toBe('Test Dataset');
      expect(parseFloat(rows[0][nameFor('value', 'value')])).toBeCloseTo(42.5);
      // null fields come back as empty string after the CSV round-trip
      expect(rows[0][nameFor('laboratory_method', 'lab_method')]).toBe('');
    });
  });

  describe('ESRI Shapefile field name truncation', () => {
    it('should use truncated field names for SHP format to comply with 10-character limit', async () => {
      const format = FileFormat.SHP;
      const writer = new GeoFileWriter(format);
      const property = 'Al';

      await writer.openFile(TEST_OUTPUT_DIR);
      await writer.setProperty(property);

      const sample = makeSample({ id: '1', property_acronym: property });
      await writer.writeRecord(soilSampleToExportRecord(sample));
      await writer.closeFile();

      const { fieldNames } = await readLayerRows(format, property);

      EXPORT_SCHEMA.forEach(field => {
        // 'geom' is handled as geometry, not a field, in SHP
        if (field.key !== 'geom') {
          expect(fieldNames).toContain(field.title_truncated);
          if (field.title !== field.title_truncated) {
            expect(fieldNames).not.toContain(field.title);
          }
        }
      });
    });
  });
});
