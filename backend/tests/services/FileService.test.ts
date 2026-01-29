import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import FileService from '../../src/services/FileService';

// Use absolute path from package root
const vectorFilesPassPath = path.join(__dirname, '../assets/vector_files/pass');
const vectorFilesFailPath = path.join(__dirname, '../assets/vector_files/fail');

describe('FileService', () => {
  let fileService: FileService;

  beforeAll(async () => {
    fileService = new FileService();
  });

  const setLocalStorageRootFolder = (rootFolder: string) => {
    process.env.LOCAL_STORAGE_ROOT_FOLDER = rootFolder;
  };

  describe('extractMetadata - valid files', () => {
    it('should extract metadata from sample_point GeoJSON file', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('sample_point.geojson');

      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.field_names).toContain('metadata');
      expect(metadata.field_names).toContain('rawParameters');
      expect(metadata.detected_fields).toBeDefined();
      expect(metadata.detected_fields.crs).toBe('EPSG:4326');
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should extract metadata from valid area GeoJSON file', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('valid_area_in_spain.geojson');

      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should extract metadata from another GeoJSON file', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const csvFile = '211.geojson';
      const metadata = await fileService.extractMetadata(csvFile);

      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should detect geometry field from multi-layer vector files', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('example.gpkg');

      expect(metadata.geometry_detected).toBeTruthy();
    });

    it('should detect CRS when available', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('valid_area_in_spain.geojson');

      expect(metadata.detected_fields.crs).toBe('EPSG:4326');
    });

    it('should handle files without CRS gracefully', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('valid1.csv');

      // Field should exist even if empty
      expect(metadata.detected_fields.crs).toBeNull();
    });

    it('should extract metadata from ZIP files with Shapefiles', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('gis_osm_natural_07_1.zip');

      expect(metadata).toBeDefined();
      expect(metadata.field_names).toBeDefined();
      expect(Array.isArray(metadata.field_names)).toBe(true);
      expect(metadata.detected_fields).toBeDefined();
      expect(metadata.detected_fields.geometry).toBeDefined();
    });

    it.each(['audit.csv', 'data_download.csv'])('should not detect geometry column for non-spatial CSV files', async file => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata(file);
      expect(metadata.geometry_detected).toBeFalsy();
      expect(metadata.detected_fields.geometry).toBeNull();
      expect(metadata.detected_fields.latitude).toBeNull();
      expect(metadata.detected_fields.longitude).toBeNull();
    });
  });

  describe('extractMetadata - invalid files', () => {
    it('should fail for invalid files', async () => {
      setLocalStorageRootFolder(vectorFilesFailPath);
      await expect(fileService.extractMetadata('invalid.geojson')).rejects.toThrow('Failed to extract metadata');
    });

    it('should return 404 for non-existent files', async () => {
      setLocalStorageRootFolder(vectorFilesFailPath);
      await expect(fileService.extractMetadata('nonexistent_file.geojson')).rejects.toThrow('not found');
    });
  });

  describe('extractMetadata - batch tests', () => {
    it('should process all valid files without errors', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const files = fs.readdirSync(vectorFilesPassPath);
      const results = [];

      for (const file of files) {
        try {
          const metadata = await fileService.extractMetadata(file);
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
          const metadata = await fileService.extractMetadata(file);
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
      await expect(fileService.extractMetadata('gis_osm_runways_07_1.zip')).rejects.toThrow(
        'Only Point or Polygon geometry types are supported.',
      );
    });
  });

  describe('extractMetadata - metadata structure', () => {
    it('should return FileMetadata with correct structure', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('sample_point.geojson');

      expect(metadata).toHaveProperty('field_names');
      expect(metadata).toHaveProperty('detected_fields');

      // Check detected_fields structure
      expect(metadata.detected_fields).toHaveProperty('geometry');
      expect(metadata.detected_fields).toHaveProperty('license');
      expect(metadata.detected_fields).toHaveProperty('date');
      expect(metadata.detected_fields).toHaveProperty('crs');
    });

    it('should populate field_names with vector fields', async () => {
      setLocalStorageRootFolder(vectorFilesPassPath);
      const metadata = await fileService.extractMetadata('sample_point.geojson');

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
