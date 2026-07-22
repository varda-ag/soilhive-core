import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import FileService from '../../src/services/FileService';
import { VectorFileMetadata } from '../../src/interfaces/File';
import { getTableColumns } from '../helper';
import { getRawTableName, sanitizeField } from '../../src/utils/utils';
import { DetectableFields } from '../../src/types/DataMapping';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { addDataset, addDataMapping, addDatasetFileMapping, addSoilProperty, addCategory } from '../../src/utils/mock';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { EntityManager } from 'typeorm';
import FileEntity from '../../src/entities/File';
import { IngestionStatus } from '../../src/types/data';

// Use absolute path from package root
const vectorFilesPassPath = path.join(__dirname, '../assets/vector_files/pass');
const vectorFilesFailPath = path.join(__dirname, '../assets/vector_files/fail');
const rasterFilesPath = path.join(__dirname, '../assets/raster');

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
      const metadata = fileEntity.metadata as VectorFileMetadata;
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.field_names).toContain('metadata');
      expect(metadata.field_names).toContain('rawParameters');
      expect(metadata.detected_fields).toBeDefined();
      expect(metadata.epsg).toBe(4326);
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should load to DB sample_point GeoJSON file', async () => {
      const fileId = fileEntity.slug;

      await fileService.fileToDB(requestData, fileId);
      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      expect(fileEntity.metadata).toBeDefined();
      const metadata = fileEntity.metadata as VectorFileMetadata;
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
          .map(item => item.column_name)
          .sort(),
      );
      if (metadata.geometry_detected) {
        expect(tableColumns.map(item => item.column_name)).toContain('geometry');
      }
      expect(tableColumns.map(item => item.column_name)).toContain('record_id');

      const reloaded = await entityManager.findOne(FileEntity, { where: { id: fileEntity.id } });
      expect(reloaded?.status).toBe(IngestionStatus.STAGED);
    });
  });

  describe('extractMetadata and fileToDB - area GeoJSON file', () => {
    const fileKey = 'valid_area_in_spain.geojson';
    let metadata: VectorFileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
      metadata = fileEntity.metadata as VectorFileMetadata;
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
      await expect(fileService.fileToDB(requestData, fileId)).rejects.toMatchObject({ name: 'JobError', code: 'FTD_NO_DATA_COLUMNS' });
    });
  });

  describe('extractMetadata and fileToDB - another area GeoJSON file', () => {
    const fileKey = '211.geojson';
    let metadata: VectorFileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      metadata = (await fileService.extractMetadata(requestData, fileKey)) as VectorFileMetadata;
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
      await expect(fileService.fileToDB(requestData, fileId)).rejects.toMatchObject({ name: 'JobError', code: 'FTD_NO_DATA_COLUMNS' });
    });
  });

  describe('extractMetadata and fileToDB - special characters in fields file', () => {
    const fileKey = 'special_characters_fields.csv';
    let metadata: VectorFileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      metadata = (await fileService.extractMetadata(requestData, fileKey)) as VectorFileMetadata;
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
    });

    it('should extract metadata fields even with special characters', async () => {
      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      // GEOM_POSSIBLE_NAMES=* makes GDAL detect the WKT column as native geometry
      expect(metadata.geometry_detected).toBeTruthy();
      expect(metadata.detected_fields).toBeDefined();

      // Check detected_fields structure
      expect(metadata.detected_fields).toHaveProperty(DetectableFields.GEOMETRY);
      expect(metadata.detected_fields[DetectableFields.GEOMETRY]).toBe('geom WKT');
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
    let metadata: VectorFileMetadata;
    let requestData: RequestData;
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      metadata = (await fileService.extractMetadata(requestData, fileKey)) as VectorFileMetadata;
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
      let metadata: VectorFileMetadata;
      let requestData: RequestData;
      let fileEntity: FileEntity;

      beforeEach(async () => {
        setLocalStorageRootFolder(vectorFilesPassPath);
        requestData = { entityManager, token: mockToken, entitlements: {} };
        fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
        metadata = fileEntity.metadata as VectorFileMetadata;
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
        const metadata = (await fileService.extractMetadata(requestData, 'gis_osm_natural_07_1.zip')) as VectorFileMetadata;

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
      it.each(['s3', 'local'])(
        'should process all valid files without errors. Storage mode: %s',
        async storageMode => {
          process.env.STORAGE_MODE = storageMode;
          setLocalStorageRootFolder(vectorFilesPassPath); // This affects only local storage
          const prefix = storageMode === 's3' ? 'vector_files/pass/' : '';
          const files = fs
            .readdirSync(vectorFilesPassPath, { withFileTypes: true })
            .filter(dirent => dirent.isFile())
            .map(dirent => dirent.name); // or dirent.path for full path;
          const results = [];

          for (const file of files) {
            try {
              const metadata = (await fileService.extractMetadata(requestData, prefix + file)) as VectorFileMetadata;
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
        },
        8000,
      );

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
        const metadata = (await fileService.extractMetadata(requestData, 'sample_point.geojson')) as VectorFileMetadata;

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
        const metadata = (await fileService.extractMetadata(requestData, 'sample_point.geojson')) as VectorFileMetadata;

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

  describe('extractMetadata - raster files', () => {
    beforeEach(() => {
      setLocalStorageRootFolder(rasterFilesPath);
    });

    it('should detect a GeoTIFF as raster and populate driver/epsg/band_count/extent/size', async () => {
      const metadata = await fileService.extractMetadata(requestData, 'bdod_5-15cm_mean.tif');

      expect(metadata.is_raster).toBe(true);
      if (!metadata.is_raster) throw new Error('expected raster metadata');

      expect(metadata.driver).toBe('GTiff');
      expect(metadata.epsg).toBe(4326);
      expect(metadata.band_count).toBe(1);
      expect(metadata.size).toEqual([292, 245]);

      const [minX, minY, maxX, maxY] = metadata.extent!;
      expect(minX).toBeCloseTo(-81.1441253, 5);
      expect(minY).toBeCloseTo(-34.0033135, 5);
      expect(maxX).toBeCloseTo(-80.4794715, 5);
      expect(maxY).toBeCloseTo(-33.4456381, 5);
    });

    it('should populate band min/max only when cached in a PAM sidecar (.aux.xml)', async () => {
      const metadata = await fileService.extractMetadata(requestData, 'bdod_5-15cm_mean.tif');
      if (!metadata.is_raster) throw new Error('expected raster metadata');

      expect(metadata.raster_bands).toHaveLength(1);
      expect(metadata.raster_bands[0]).toMatchObject({
        band_number: 1,
        data_type: 'Int16',
        min_value: 89,
        max_value: 112,
        no_data_value: -32768,
      });
    });

    it('should populate band overview pyramid sizes', async () => {
      const metadata = await fileService.extractMetadata(requestData, 'bdod_5-15cm_mean.tif');
      if (!metadata.is_raster) throw new Error('expected raster metadata');

      expect(metadata.raster_bands[0]!.overviews).toEqual([
        [146, 123],
        [73, 62],
        [37, 31],
        [19, 16],
        [10, 8],
      ]);
    });

    it('should leave band min/max undefined when no cached stats are present', async () => {
      const metadata = await fileService.extractMetadata(requestData, 'sol_ph.h2o_usda.4c1a2a_m_250m_b0..0cm_1950..2017_v0.2_1000.tif');
      if (!metadata.is_raster) throw new Error('expected raster metadata');

      expect(metadata.driver).toBe('GTiff');
      expect(metadata.band_count).toBe(1);
      expect(metadata.size).toEqual([56, 47]);
      expect(metadata.raster_bands[0]).toMatchObject({
        band_number: 1,
        data_type: 'Byte',
        no_data_value: 255,
      });
      expect(metadata.raster_bands[0]!.min_value).toBeUndefined();
      expect(metadata.raster_bands[0]!.max_value).toBeUndefined();
    });

    it.each([
      { fileName: 'sol_ph.h2o_usda.4c1a2a_m_250m_b0..0cm_1950..2017_v0.2_250.tif', size: [335, 281] },
      { fileName: 'sol_ph.h2o_usda.4c1a2a_m_250m_b0..0cm_1950..2017_v0.2_500.tif', size: [160, 140] },
    ])('should detect $fileName as raster with the expected driver/epsg/extent/size', async ({ fileName, size }) => {
      const metadata = await fileService.extractMetadata(requestData, fileName);
      if (!metadata.is_raster) throw new Error('expected raster metadata');

      expect(metadata.driver).toBe('GTiff');
      expect(metadata.epsg).toBe(4326);
      expect(metadata.size).toEqual(size);

      const [minX, minY, maxX, maxY] = metadata.extent!;
      expect(minX).toBeCloseTo(-81.1625158, 5);
      expect(minY).toBeCloseTo(-34.0153972, 5);
      expect(maxX).toBeCloseTo(-80.4645993, 5);
      expect(maxY).toBeCloseTo(-33.4299807, 5);
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
      const cat = await addCategory();
      const prop = await addSoilProperty('pH', cat.id);
      const dataMapping = await addDataMapping({ wkt_col: 'geometry', rawParameters: { property_id: prop.slug } });
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
      expect(parseFloat(rows[0].x)).toBeCloseTo(39.6544, 4);
    });

    it('loads geometry from a WKT column auto-detected as native geometry (CSV)', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_wkt.csv',
        file_path: 'test_geom_wkt.csv',
      });
      const dataset = await addDataset('test_geom_wkt_mapping', [0, 0, 30, 60]);
      const cat = await addCategory();
      const prop = await addSoilProperty('pH', cat.id);
      const dataMapping = await addDataMapping({ wkt_col: 'geometry', ph: { property_id: prop.slug } });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x FROM "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileEntity.id)}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      expect(parseFloat(rows[0].x)).toBeCloseTo(10.0, 4);
    });

    it('uses mapped lat/lon columns when no geometry is auto-detected', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_latlon.csv',
        file_path: 'test_geom_latlon.csv',
        metadata: {
          is_raster: false,
          driver: 'CSV',
          field_names: ['y_coord', 'x_coord', 'ph'],
          detected_fields: { ...nullDetectedFields },
          geometry_detected: false,
          detected_mapping: {},
        },
      });
      const dataset = await addDataset('test_geom_latlon_mapping', [0, 0, 30, 60]);
      const cat = await addCategory();
      const prop = await addSoilProperty('pH', cat.id);
      const dataMapping = await addDataMapping({ y_coord: 'latitude', x_coord: 'longitude', ph: { property_id: prop.slug } });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableColumns = await getTableColumns(getRawTableName(fileEntity.id));
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');
    });

    it('auto-detected WKT column takes precedence over auto-detected lat/lon fields', async () => {
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_override.csv',
        file_path: 'test_geom_override.csv',
      });
      const dataset = await addDataset('test_geom_override_mapping', [0, 0, 30, 60]);
      const cat = await addCategory();
      const prop = await addSoilProperty('pH', cat.id);
      const dataMapping = await addDataMapping({ wkt_col: 'geometry', ph: { property_id: prop.slug } });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x FROM "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileEntity.id)}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      expect(parseFloat(rows[0].x)).toBeCloseTo(20.0, 4);
    });

    it('falls back to auto-detected lat/lon when no mapping exists for the file', async () => {
      // Uses standard lat/lon column names so extractMetadata auto-detects them (no geometry mapping needed)
      const fileEntity = await fileService.createFile(requestData, {
        name: 'test_geom_latlon_std.csv',
        file_path: 'test_geom_latlon_std.csv',
      });

      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableColumns = await getTableColumns(getRawTableName(fileEntity.id));
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');
    });

    it.each(['basic-soil-example_wkt.csv', 'test_geom_wkt2.csv'])('CSV contains geometry column named WKT', async fileKey => {
      const fileEntity = await fileService.createFile(requestData, {
        name: fileKey,
        file_path: fileKey,
      });

      const dataset = await addDataset('test_wkt_named_column', [0, 0, 30, 60]);
      const cat = await addCategory();
      const prop = await addSoilProperty('pH', cat.id);
      const dataMapping = await addDataMapping({ WKT: 'geometry', ph: { property_id: prop.slug } });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x FROM "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileEntity.id)}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      expect(parseFloat(rows[0].x)).toBeDefined();
    });
  });

  describe('extractMetadata and fileToDB - XLSX file with lat/lon columns', () => {
    const fileKey = 'excel.xlsx';
    let fileEntity: FileEntity;

    beforeEach(async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      requestData = { entityManager, token: mockToken, entitlements: {} };
      fileEntity = await fileService.createFile(requestData, { name: fileKey, file_path: fileKey });
    });

    it('should detect driver XLSX with no native geometry and auto-detect lat/lon fields', () => {
      const metadata = fileEntity.metadata as VectorFileMetadata;
      expect(metadata.driver).toBe('XLSX');
      expect(metadata.geometry_detected).toBeFalsy();
      expect(metadata.detected_fields[DetectableFields.LATITUDE]).toBeTruthy();
      expect(metadata.detected_fields[DetectableFields.LONGITUDE]).toBeTruthy();
    });

    it('should load XLSX to DB using auto-detected lat/lon columns (VRT path)', async () => {
      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');
      expect(tableColumns.map(c => c.column_name)).toContain('record_id');

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x, ST_Y(geometry) as y FROM "${process.env.POSTGRES_SCHEMA}"."${tableName}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(parseFloat(rows[0].x)).toBeCloseTo(39.6464, 3);
      expect(parseFloat(rows[0].y)).toBeCloseTo(-3.7892, 3);

      const reloaded = await entityManager.findOne(FileEntity, { where: { id: fileEntity.id } });
      expect(reloaded?.status).toBe(IngestionStatus.STAGED);
    });

    it('should load XLSX to DB using mapped lat/lon columns (VRT path)', async () => {
      const xlsxMetadata = fileEntity.metadata as VectorFileMetadata;
      const latField = xlsxMetadata.detected_fields[DetectableFields.LATITUDE]!;
      const lonField = xlsxMetadata.detected_fields[DetectableFields.LONGITUDE]!;

      const dataset = await addDataset('test_xlsx_mapped_latlon', [0, 0, 50, 10]);
      const cat = await addCategory();
      const prop = await addSoilProperty('pH', cat.id);
      const dataMapping = await addDataMapping({ [latField]: 'latitude', [lonField]: 'longitude', shheight: { property_id: prop.slug } });
      const dfm = await addDatasetFileMapping(dataset.id, dataMapping.id);
      dfm.file_id = fileEntity.id;
      await dfm.save();

      await fileService.fileToDB(requestData, fileEntity.slug);

      const tableName = getRawTableName(fileEntity.id);
      const tableColumns = await getTableColumns(tableName);
      expect(tableColumns.map(c => c.column_name)).toContain('geometry');

      const dataSource = await getDataSource();
      const rows = await dataSource.query(
        `SELECT ST_X(geometry) as x, ST_Y(geometry) as y FROM "${process.env.POSTGRES_SCHEMA}"."${tableName}" WHERE geometry IS NOT NULL LIMIT 1`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(parseFloat(rows[0].x)).toBeCloseTo(39.6464, 3);
      expect(parseFloat(rows[0].y)).toBeCloseTo(-3.7892, 3);
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
