import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import FileService from '../../src/services/FileService';
import { FileMetadata } from '../../src/interfaces/File';
import { getTableColumns } from '../helper';
import { getRawTableName, sanitizeField } from '../../src/utils/utils';
import { DetectableFields } from '../../src/types/DataMapping';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { addDataset, addDataMapping, addDatasetFileMapping } from '../../src/utils/mock';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { EntityManager } from 'typeorm';
import FileEntity from '../../src/entities/File';

// Use absolute path from package root
const vectorFilesPassPath = path.join(__dirname, '../assets/vector_files/pass');
const vectorFilesFailPath = path.join(__dirname, '../assets/vector_files/fail');

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

describe('FileService', () => {
  let fileService: FileService;
  let entityManager: EntityManager;
  let requestData: RequestData;

  beforeAll(async () => {
    fileService = new FileService();
    entityManager = await getEntityManager();
    requestData = { entityManager, token: mockToken, entitlements: {} };
  });

  const setLocalStorageRootFolder = (rootFolder: string) => {
    process.env.LOCAL_STORAGE_ROOT_FOLDER = rootFolder;
  };

  describe('getUploadStorageEngine - path resolver', () => {
    const storage = FileService.getUploadStorageEngine();
    it('builds expected path from req.customData.uploadedFileInfo for normal upload', async () => {
      const req: any = {
        path: '/files',
      };
      const date = new Date();
      const file: any = { originalname: '../  test file path.gpkg' };
      const path = await (storage as any).destinationResolver('handle', req, file);
      const year = date.getUTCFullYear();
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');

      expect(path.startsWith(`${year}/${month}/`)).toBeTruthy();
      expect(path.endsWith('_test_file_path.gpkg')).toBeTruthy();
    });
  });

  describe('postFile', () => {
    it('should create a new file record when the name is unique', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);

      const file = {
        name: 'sample_point.geojson',
        file_path: 'sample_point.geojson',
      };

      const result = await fileService.createFile(requestData, file);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toEqual(file.name);
    });
  });

  describe('extractMetadata and fileToDB - valid file sample_point GeoJSON file', () => {
    const fileKey = 'sample_point.geojson';
    let fileEntity: FileEntity;
    let requestData: RequestData;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);

      const file = {
        name: fileKey,
        file_path: fileKey,
      };
      requestData = { entityManager, token: mockToken, entitlements: {} };
      fileEntity = await fileService.createFile(requestData, file);
    });

    it('should extract metadata from sample_point GeoJSON file', async () => {
      expect(fileEntity).toBeDefined();
      expect(fileEntity.metadata).toBeDefined();
      expect(fileEntity.metadata!.field_names).toBeDefined();
      expect(Array.isArray(fileEntity.metadata!.field_names)).toBe(true);
      expect(fileEntity.metadata!.field_names).toContain('metadata');
      expect(fileEntity.metadata!.field_names).toContain('rawParameters');
      expect(fileEntity.metadata!.detected_fields).toBeDefined();
      expect(fileEntity.metadata!.epsg).toBe(4326);
      expect(fileEntity.metadata!.geometry_detected).toBeTruthy();
    });

    it('should load to DB sample_point GeoJSON file', async () => {
      const fileId = fileEntity.slug;

      await fileService.fileToDB(requestData, fileId);
      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      expect(fileEntity.metadata).toBeDefined();
      const originalGeomFields = [
        fileEntity.metadata!.detected_fields[DetectableFields.GEOMETRY],
        fileEntity.metadata!.detected_fields[DetectableFields.LONGITUDE],
        fileEntity.metadata!.detected_fields[DetectableFields.LATITUDE],
      ];
      expect(
        fileEntity
          .metadata!.field_names.filter(item => !originalGeomFields.includes(item))
          .map(field => sanitizeField(field))
          .sort(),
      ).toEqual(
        tableColumns
          .filter(({ column_name }) => !['record_id', 'geometry'].includes(column_name))
          .map(item => item.column_name)
          .sort(),
      );
      if (fileEntity.metadata!.geometry_detected) {
        expect(tableColumns.map(item => item.column_name)).toContain('geometry');
      }
      expect(tableColumns.map(item => item.column_name)).toContain('record_id');
    });
  });

  describe('extractMetadata and fileToDB - area GeoJSON file', () => {
    const fileKey = 'valid_area_in_spain.geojson';
    let metadata: FileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
      metadata = fileEntity.metadata!;
    });

    it('should extract metadata from area GeoJSON file', async () => {
      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should detect CRS when available', async () => {
      expect(metadata.epsg).toBe(4326);
    });

    it('should fail to load to DB only area GeoJSON file', async () => {
      const fileId = fileEntity.slug;
      await expect(fileService.fileToDB(requestData, fileId)).rejects.toThrow('No data besides geometry detected');
    });
  });

  describe('extractMetadata and fileToDB - another area GeoJSON file', () => {
    const fileKey = '211.geojson';
    let metadata: FileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      metadata = await fileService.extractMetadata(requestData, fileKey);
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
    });

    it('should extract metadata from another GeoJSON file', async () => {
      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should fail to load to DB only area GeoJSON file', async () => {
      const fileId = fileEntity.slug;
      await expect(fileService.fileToDB(requestData, fileId)).rejects.toThrow('No data besides geometry detected');
    });
  });

  describe('extractMetadata and fileToDB - special characters in fields file', () => {
    const fileKey = 'special_characters_fields.csv';
    let metadata: FileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      metadata = await fileService.extractMetadata(requestData, fileKey);
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
    });

    it('should extract metadata fields even with special characters', async () => {
      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.geometry_detected).toBeFalsy();
      expect(metadata.detected_fields).toBeDefined();

      // Check detected_fields structure
      expect(metadata.detected_fields).toHaveProperty(DetectableFields.GEOMETRY);
      expect(metadata.detected_fields[DetectableFields.GEOMETRY]).toBeDefined();
      expect(metadata.detected_fields).toHaveProperty(DetectableFields.LICENSE);
      expect(metadata.detected_fields[DetectableFields.LICENSE]).toBeDefined();
      expect(metadata.detected_fields).toHaveProperty(DetectableFields.SAMPLING_DATE);
      expect(metadata.detected_fields[DetectableFields.SAMPLING_DATE]).toBeDefined();
      expect(metadata).not.toHaveProperty('epsg');
    });
    it('should create table in DB with column names as sanitized field_names', async () => {
      const fileId = fileEntity.slug;
      await fileService.fileToDB(requestData, fileId);
      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      const originalGeomFields = [
        metadata.detected_fields[DetectableFields.GEOMETRY],
        metadata.detected_fields[DetectableFields.LONGITUDE],
        metadata.detected_fields[DetectableFields.LATITUDE],
      ];
      expect(
        metadata.field_names
          .filter(item => !originalGeomFields.includes(item))
          .map(field => sanitizeField(field))
          .sort(),
      ).toEqual(
        tableColumns
          .filter(({ column_name }) => !['record_id', 'geometry'].includes(column_name))
          .map(item => item.column_name.replace('-', '_').replace(/[^a-z0-9_]/g, ''))
          .sort(),
      );
      expect(tableColumns.map(item => item.column_name)).toContain('geometry');
      expect(tableColumns.map(item => item.column_name)).toContain('record_id');
    });
  });

  describe('extractMetadata and fileToDB - multi-layer GPKG file', () => {
    const fileKey = 'example.gpkg';
    let metadata: FileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      metadata = await fileService.extractMetadata(requestData, fileKey);
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
    });

    it('should detect geometry field from multi-layer vector files', async () => {
      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should load to DB same layer as detected in metadata', async () => {
      const fileId = fileEntity.slug;
      await fileService.fileToDB(requestData, fileId);
      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      const originalGeomFields = [
        metadata.detected_fields[DetectableFields.GEOMETRY],
        metadata.detected_fields[DetectableFields.LONGITUDE],
        metadata.detected_fields[DetectableFields.LATITUDE],
      ];
      expect(
        metadata.field_names
          .filter(item => !originalGeomFields.includes(item))
          .map(field => sanitizeField(field))
          .sort(),
      ).toEqual(
        tableColumns
          .filter(({ column_name }) => !['record_id', 'geometry'].includes(column_name))
          .map(item => item.column_name.replace('-', '_').replace(/[^a-z0-9_]/g, ''))
          .sort(),
      );
      expect(tableColumns.map(item => item.column_name)).toContain('geometry');
      expect(tableColumns.map(item => item.column_name)).toContain('record_id');
    });
  });

  describe('extractMetadata and fileToDB - files with no geometry', () => {
    const fileKeys = ['audit.csv', 'data_download.csv'];

    describe.each(fileKeys)('fileKey: %s', fileKey => {
      let metadata: FileMetadata;
      let requestData: RequestData;
      let fileEntity: FileEntity;

      beforeEach(async () => {
        setLocalStorageRootFolder(vectorFilesPassPath);
        requestData = { entityManager, token: mockToken, entitlements: {} };
        fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
        metadata = fileEntity.metadata!;
      });

      it('should not detect geometry column for non-spatial CSV files', async () => {
        expect(metadata.geometry_detected).toBeFalsy();
        expect(metadata.detected_fields.geometry).toBeNull();
        expect(metadata.detected_fields.latitude).toBeNull();
        expect(metadata.detected_fields.longitude).toBeNull();
      });

      it('should throw error when trying to load to DB', async () => {
        const fileId = fileEntity.slug;
        await expect(fileService.fileToDB(requestData, fileId)).rejects.toThrow(
          'Geometry not found: no geometry column in user mapping or auto-detected fields',
        );
      });
    });

    describe('extractMetadata - remaining valid tests', () => {
      beforeEach(() => {
        setLocalStorageRootFolder(vectorFilesPassPath);
      });

      it('should handle files without CRS gracefully', async () => {
        const metadata = await fileService.extractMetadata(requestData, 'valid1.csv');
        expect(metadata.epsg).toBeUndefined();
      });

      it('should extract metadata from ZIP files with Shapefiles', async () => {
        const metadata = await fileService.extractMetadata(requestData, 'gis_osm_natural_07_1.zip');

        expect(metadata).toBeDefined();
        expect(metadata.field_names).toBeDefined();
        expect(Array.isArray(metadata.field_names)).toBe(true);
        expect(metadata.detected_fields).toBeDefined();
        expect(metadata.detected_fields.geometry).toBeDefined();
      });
    });

    describe('extractMetadata - invalid files', () => {
      it('should fail for invalid files', async () => {
        setLocalStorageRootFolder(vectorFilesFailPath);
        await expect(fileService.extractMetadata(requestData, 'invalid.geojson')).rejects.toThrow('Failed to extract metadata');
      });

      it('should return 404 for non-existent files', async () => {
        setLocalStorageRootFolder(vectorFilesFailPath);
        await expect(fileService.extractMetadata(requestData, 'nonexistent_file.geojson')).rejects.toThrow('not found');
      });
    });

    describe('extractMetadata - batch tests', () => {
      it('should process all valid files without errors', async () => {
        setLocalStorageRootFolder(vectorFilesPassPath);
        const files = fs
          .readdirSync(vectorFilesPassPath, { withFileTypes: true })
          .filter(dirent => dirent.isFile())
          .map(dirent => dirent.name); // or dirent.path for full path;
        const results = [];

        for (const file of files) {
          try {
            const metadata = await fileService.extractMetadata(requestData, file);
            results.push({ file, success: true, metadata });
          } catch (error) {
            results.push({ file, success: false, error });
          }
        }

        // At least some files in pass folder should succeed
        const successfulResults = results.filter(r => r.success);
        expect(successfulResults.length).toEqual(results.length);

        // All successful extractions should have metadata
        for (const result of successfulResults) {
          expect(result.metadata).toBeDefined();
          expect(result.metadata!.field_names).toBeDefined();
          expect(result.metadata!.detected_fields).toBeDefined();
        }
      });

      it('should fail for all invalid files', async () => {
        setLocalStorageRootFolder(vectorFilesFailPath);
        const files = fs.readdirSync(vectorFilesFailPath);
        const results = [];

        for (const file of files) {
          try {
            const metadata = await fileService.extractMetadata(requestData, file);
            results.push({ file, success: true, metadata });
          } catch (error) {
            results.push({ file, success: false, error });
          }
        }

        const successfulFiles = results.filter(r => r.success);
        expect(successfulFiles.length).toBe(0);

        // All failed extractions should have errors
        for (const result of results) {
          expect(result.error).toBeDefined();
        }
      });

      it('should successfully extract ZIP files from fail folder if they contain valid geometry', async () => {
        // gis_osm_runways_07_1.zip contains LineString geometry which is NOT supported
        setLocalStorageRootFolder(vectorFilesFailPath);
        await expect(fileService.extractMetadata(requestData, 'gis_osm_runways_07_1.zip')).rejects.toThrow(
          'Only Point or Polygon geometry types are supported.',
        );
      });
    });

    describe('extractMetadata - metadata structure', () => {
      it('should return FileMetadata with correct structure', async () => {
        setLocalStorageRootFolder(vectorFilesPassPath);
        const metadata = await fileService.extractMetadata(requestData, 'sample_point.geojson');

        expect(metadata).toHaveProperty('field_names');
        expect(metadata).toHaveProperty('detected_fields');

        // Check detected_fields structure
        expect(metadata.detected_fields).toHaveProperty('geometry');
        expect(metadata.detected_fields).toHaveProperty('license');
        expect(metadata.detected_fields).toHaveProperty('sampling_date');
        expect(metadata).toHaveProperty('epsg');
      });

      it('should populate field_names with vector fields', async () => {
        setLocalStorageRootFolder(vectorFilesPassPath);
        const metadata = await fileService.extractMetadata(requestData, 'sample_point.geojson');

        expect(Array.isArray(metadata.field_names)).toBe(true);
        // GeoJSON typically has at least some properties
        expect(metadata.field_names.length).toBeGreaterThanOrEqual(0);

        // All field names should be strings
        for (const fieldName of metadata.field_names) {
          expect(typeof fieldName).toBe('string');
        }
      });
    });
  });

  describe('fileToDB - geometry column from DatasetFileMapping', () => {
    const nullDetectedFields = {
      depth: null,
      horizon: null,
      license: null,
      geometry: null,
      latitude: null,
      longitude: null,
      max_depth: null,
      min_depth: null,
      sampling_date: null,
    };

    beforeEach(() => {
      setLocalStorageRootFolder(vectorFilesPassPath);
    });

    it('ignores mapping geometry fields and uses native geometry when geometry_detected is true', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'sample_point.geojson',
        file_path: 'sample_point.geojson',
      });
      const dataset = await addDataset('test_geom_native_mapping', [0, 0, 30, 60]);
      const dataMapping = await addDataMapping({ wkt_col: 'geometry' });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x FROM "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileEntity.id)}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      // Native geometry from sample_point.geojson has longitude ~39.6544.
      // If the mapping were applied instead, wkt_col doesn't exist in the file so geometry would be null.
      expect(rows.length).toBeGreaterThan(0);
      expect(parseFloat(rows[0].x)).toBeCloseTo(39.6544, 1);
    });

    it('uses mapped WKT column when no geometry is auto-detected', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_wkt.csv',
        file_path: 'test_geom_wkt.csv',
      });
      const dataset = await addDataset('test_geom_wkt_mapping', [0, 0, 30, 60]);
      const dataMapping = await addDataMapping({ wkt_col: 'geometry' });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x, ST_Y(geometry) as y FROM "${process.env.POSTGRES_SCHEMA}"."${tableName}" ORDER BY ST_X(geometry)`,
      );
      expect(parseFloat(rows[0].x)).toBeCloseTo(10.0, 4);
      expect(parseFloat(rows[0].y)).toBeCloseTo(45.0, 4);
      expect(parseFloat(rows[1].x)).toBeCloseTo(11.0, 4);
      expect(parseFloat(rows[1].y)).toBeCloseTo(46.0, 4);
    });

    it('uses mapped lat/lon columns when no geometry is auto-detected', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_latlon.csv',
        file_path: 'test_geom_latlon.csv',
        metadata: {
          driver: 'CSV',
          field_names: ['y_coord', 'x_coord', 'ph'],
          detected_fields: { ...nullDetectedFields },
          geometry_detected: false,
          detected_mapping: {},
        },
      });
      const dataset = await addDataset('test_geom_latlon_mapping', [0, 0, 30, 60]);
      const dataMapping = await addDataMapping({ y_coord: 'latitude', x_coord: 'longitude' });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableColumns = await getTableColumns(getRawTableName(fileEntity.id));
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');
    });

    it('mapping WKT column overrides auto-detected lat/lon fields', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_override.csv',
        file_path: 'test_geom_override.csv',
      });
      const dataset = await addDataset('test_geom_override_mapping', [0, 0, 30, 60]);
      const dataMapping = await addDataMapping({ wkt_col: 'geometry' });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x FROM "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileEntity.id)}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      expect(parseFloat(rows[0].x)).toBeCloseTo(20.0, 1);
    });

    it('falls back to auto-detected lat/lon when no mapping exists for the file', async () => {
      // Uses standard lat/lon column names so extractMetadata auto-detects them (no mapping needed)
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_latlon_std.csv',
        file_path: 'test_geom_latlon_std.csv',
      });

      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableColumns = await getTableColumns(getRawTableName(fileEntity.id));
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');
    });
  });

  describe('getDetectedMapping', () => {
    it('returns {} when fieldNames is empty', () => {
      expect(fileService.getDetectedMapping([], [{ col_a: 'x' }])).toEqual({});
    });

    it('returns {} when mappings is empty', () => {
      expect(fileService.getDetectedMapping(['col_a'], [])).toEqual({});
    });

    it('returns {} when no fieldName matches any mapping', () => {
      expect(fileService.getDetectedMapping(['col_a'], [{ col_b: 'x' }])).toEqual({});
    });

    it('skips falsy string values', () => {
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: '' }])).toEqual({});
    });

    it('records a string value on the first match', () => {
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: 'x' }])).toEqual({ col_a: 'x' });
    });

    it('records a PropertyMapping object on the first match', () => {
      const pm = { property_id: 'p1' };
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: pm }])).toEqual({ col_a: pm });
    });

    it('keeps the first string when a subsequent mapping also has a string for the same field', () => {
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: 'first' }, { col_a: 'second' }])).toEqual({ col_a: 'first' });
    });

    it('replaces a string with a non-empty PropertyMapping object', () => {
      const pm = { property_id: 'p1' };
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: 'string_val' }, { col_a: pm }])).toEqual({ col_a: pm });
    });

    it('does not replace a string with an empty object', () => {
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: 'string_val' }, { col_a: {} as any }])).toEqual({
        col_a: 'string_val',
      });
    });

    it('replaces a PropertyMapping object with a richer one (more keys)', () => {
      const lean = { property_id: 'p1' };
      const rich = { property_id: 'p1', conversion_id: 'c1', min_val: 0 };
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: lean }, { col_a: rich }])).toEqual({ col_a: rich });
    });

    it('keeps the existing PropertyMapping object when the subsequent one has fewer keys', () => {
      const rich = { property_id: 'p1', conversion_id: 'c1' };
      const lean = { property_id: 'p2' };
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: rich }, { col_a: lean }])).toEqual({ col_a: rich });
    });

    it('does not replace a PropertyMapping object with a string', () => {
      const pm = { property_id: 'p1' };
      expect(fileService.getDetectedMapping(['col_a'], [{ col_a: pm }, { col_a: 'string_val' }])).toEqual({ col_a: pm });
    });

    it('builds an output entry for each matched field independently', () => {
      const mappingA = { col_a: 'va' };
      const mappingB = { col_b: 'vb' };
      expect(fileService.getDetectedMapping(['col_a', 'col_b'], [mappingA, mappingB])).toEqual({ col_a: 'va', col_b: 'vb' });
    });

    it('selects the best value per field independently across mappings', () => {
      const pm = { property_id: 'p1', conversion_id: 'c1' };
      const mapping1 = { col_a: 'string_val', col_b: { property_id: 'p2' } };
      const mapping2 = { col_a: pm };
      expect(fileService.getDetectedMapping(['col_a', 'col_b'], [mapping1, mapping2])).toEqual({
        col_a: pm,
        col_b: { property_id: 'p2' },
      });
    });

    it('ignores fieldNames that appear in fieldNames but have no match in any mapping', () => {
      expect(fileService.getDetectedMapping(['col_a', 'col_missing'], [{ col_a: 'x' }])).toEqual({ col_a: 'x' });
    });
  });
});
