import fs from 'fs';
import path from 'path';
import os from 'os';
import extractZip from 'extract-zip';
import { S3Client } from '@aws-sdk/client-s3';
import { FileStorage } from '@flystorage/file-storage';
import { AwsS3StorageAdapter } from '@flystorage/aws-s3';
import { LocalStorageAdapter } from '@flystorage/local-fs';
import { FlystorageMulterStorageEngine } from '@flystorage/multer-storage';
import * as gdal from 'gdal-async';
import { LocalStorageConfig, S3StorageConfig, StorageConfig } from '../interfaces/StorageConfig';
import { RequestData } from '../interfaces/RequestData';
import { File, FileMetadata } from '../interfaces/File';
import { ErrorResponse } from '../utils/error';
import { StorageModes } from '../types/enums';
import { DetectableFields } from '../types/DataMapping';
import ConfigService from './ConfigService';
import { LOGO_FILE_ID } from '../constants/constants';
import FileEntity from '../entities/File';
import { getEntity } from '../utils/slugs';
import { EntityType } from '../types/data';

const allowedGeometryTypes = [
  gdal.wkbNone, // This allows generic tabular file support
  gdal.wkbPoint,
  gdal.wkbPoint25D,
  gdal.wkbMultiPoint,
  gdal.wkbMultiPoint25D,
  gdal.wkbPolygon,
  gdal.wkbPolygon25D,
  gdal.wkbMultiPolygon,
  gdal.wkbMultiPolygon25D,
];

export default class FileService {
  exists = async (fileId: string): Promise<boolean> => {
    const storage = await FileService.getStorageEngine();
    return await storage.fileExists(fileId);
  };

  deleteFile = async (fileId: string): Promise<void> => {
    const storage = await FileService.getStorageEngine();
    await storage.deleteFile(fileId);
  };

  static getUploadStorageEngine = (): FlystorageMulterStorageEngine => {
    const adapter = FileService.getAdapter();
    const fileStorage = new FileStorage(adapter);
    const storage = new FlystorageMulterStorageEngine(fileStorage, async (action, req, file) => {
      if (action === 'handle') {
        if (req.path === '/frontend/logo') {
          // Special case for logo upload
          return LOGO_FILE_ID;
        }
        // Use ID parameter to setup filename
        return req.params['fileId']!;
      } else {
        // Return folder name/destination if needed
        return file.destination;
      }
    });
    return storage;
  };

  static getStorageEngine = (): FileStorage => {
    const adapter = FileService.getAdapter();
    return new FileStorage(adapter);
  };

  static getAdapter = (): any => {
    // Creates adapter based on storage config (TODO: caching?)
    let adapter: any;
    const config: StorageConfig = ConfigService.getStorageConfig();
    switch (config.storageMode) {
      case StorageModes.LOCAL: {
        const localConfig = config.config as LocalStorageConfig;
        if (!fs.existsSync(localConfig.rootFolder)) {
          fs.mkdirSync(localConfig.rootFolder, { recursive: true });
        }
        adapter = new LocalStorageAdapter(localConfig.rootFolder);
        break;
      }
      case StorageModes.S3: {
        const s3Config = config.config as S3StorageConfig;
        const s3Client = new S3Client({ region: s3Config.region }) as any;
        adapter = new AwsS3StorageAdapter(s3Client, {
          bucket: s3Config.bucketName,
          ...(s3Config.rootFolder ? { prefix: s3Config.rootFolder } : {}),
        });
        break;
      }
      default:
        throw new Error(`Unsupported storage mode: ${config.storageMode}`);
    }
    return adapter;
  };

  getFiles = async (requestData: RequestData): Promise<File[]> => {
    const repo = requestData.entityManager.getRepository(FileEntity);
    return await repo.find();
  };

  getFile = async (requestData: RequestData, slug: string): Promise<File> => {
    return await getEntity(requestData, FileEntity, EntityType.FILE, slug);
  };

  /**
   * Extracts ZIP file to a temporary directory and finds the main data file
   * Looks for common geospatial file extensions in order: .shp, .gpkg, .geojson, .gml, .kml
   */
  private static extractZipAndFindMainFile = async (zipPath: string): Promise<{ tempFolder: string; mainFilePath: string }> => {
    const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'gdal-zip-tmp'));

    try {
      // Extract ZIP to temporary directory using extract-zip
      await extractZip(zipPath, { dir: tempFolder });

      const files = fs.readdirSync(tempFolder);
      if (files.length === 1) {
        // Only one file, return it
        const mainFilePath = path.join(tempFolder, files[0]!);
        return { tempFolder, mainFilePath };
      }

      // Find main data file with common geospatial extensions
      const extensions = ['.shp', '.gpkg', '.geojson', '.gml', '.kml', '.gdb'];

      for (const ext of extensions) {
        for (const file of files) {
          if (file.toLowerCase().endsWith(ext)) {
            const mainFilePath = path.join(tempFolder, file);
            return { tempFolder, mainFilePath };
          }
        }
      }

      throw new ErrorResponse(
        'No recognized geospatial file found in ZIP archive (expected .shp, .gpkg, .geojson, .gml, or .kml)',
        StatusCodes.BAD_REQUEST,
      );
    } catch (error) {
      // Clean up on error
      this.removeTempFolder(tempFolder);
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to extract ZIP file: ${error}`, StatusCodes.BAD_REQUEST);
    }
  };

  private static removeTempFolder = async (tempFolder: string) => {
    try {
      fs.rmSync(tempFolder, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  private static detectField = (fields: string[], expected: string[], partialMatch: boolean): string | null => {
    for (const field of fields) {
      const cleanField = field.toLowerCase().replace(/[^a-z]/g, '');
      if (expected.includes(cleanField)) {
        return field;
      }
    }
    if (!partialMatch) {
      return null;
    }
    for (const field of fields) {
      const cleanField = field.toLowerCase().replace(/[^a-z]/g, '');
      for (const p of expected) {
        if (cleanField.includes(p)) {
          return field;
        }
      }
    }
    return null;
  };

  extractMetadata = async (fileId: string): Promise<FileMetadata> => {
    const config: StorageConfig = ConfigService.getStorageConfig();
    let datasetPath: string;
    let tempZipExtractPath: string | null = null;

    try {
      // Get dataset path based on storage mode
      if (config.storageMode === StorageModes.LOCAL) {
        const localConfig = config.config as LocalStorageConfig;
        datasetPath = path.join(localConfig.rootFolder, fileId);
        if (!fs.existsSync(datasetPath)) {
          throw new ErrorResponse(`File ${fileId} not found`, StatusCodes.NOT_FOUND);
        }

        // Handle ZIP files
        if (fileId.toLowerCase().endsWith('.zip')) {
          const { tempFolder, mainFilePath } = await FileService.extractZipAndFindMainFile(datasetPath);
          tempZipExtractPath = tempFolder;
          datasetPath = mainFilePath;
        }
      } else if (config.storageMode === StorageModes.S3) {
        // For S3, we would need to download the file first to extract it
        // For now, use GDAL's S3 VSI support (which may not support ZIP)
        const s3Config = config.config as S3StorageConfig;
        const key = s3Config.rootFolder ? `${s3Config.rootFolder}/${fileId}` : fileId;
        datasetPath = `/vsis3/${s3Config.bucketName}/${key}`;

        // If it's a ZIP file on S3, we'd need to handle it differently
        // For now, this will be attempted directly with GDAL
      } else {
        throw new ErrorResponse(`Unsupported storage mode: ${config.storageMode}`, StatusCodes.INTERNAL_SERVER_ERROR);
      }

      // Open dataset with GDAL
      const dataset = await gdal.openAsync(datasetPath);

      let layer: any = null;
      let geometryDetected = false;

      for (let i = 0; i < dataset.layers.count(); i++) {
        const currentLayer = dataset.layers.get(i);
        // Check that layer contains point or polygon geometry
        const layerGeometry = currentLayer.geomType;
        if (!layerGeometry) {
          continue;
        }
        geometryDetected = layerGeometry !== gdal.wkbNone;
        if (!allowedGeometryTypes.includes(layerGeometry)) {
          continue;
        }
        // Valid layer found
        layer = currentLayer;
        break;
      }

      if (!layer) {
        if (geometryDetected) {
          throw new ErrorResponse('Only Point or Polygon geometry types are supported.', StatusCodes.BAD_REQUEST);
        } else {
          throw new ErrorResponse('No vector layers found in input file.', StatusCodes.BAD_REQUEST);
        }
      }

      if (layer.features.count() === 0) {
        throw new ErrorResponse('No features found in input file', StatusCodes.BAD_REQUEST);
      }

      // Extract field names
      const fieldNames: string[] = [];
      const fieldDefinitions = layer.fields as any;
      let geometryFieldName: string | null = null;
      let latitudeFieldName: string | null = null;
      let longitudeFieldName: string | null = null;
      let samplingDateFieldName: string | null = null;
      let licenseFieldName: string | null = null;
      let depthFieldName: string | null = null;
      let minDepthFieldName: string | null = null;
      let maxDepthFieldName: string | null = null;
      let horizonFieldName: string | null = null;

      // Iterate through fields
      for (let i = 0; i < fieldDefinitions.count(); i++) {
        const fieldDef = fieldDefinitions.get(i);
        const fieldName = fieldDef.name;
        fieldNames.push(fieldName);

        // Detect (first) date field
        const fieldType = fieldDef.type;
        if (fieldType === gdal.OFTDate || fieldType === gdal.OFTDateTime) {
          if (!samplingDateFieldName) {
            samplingDateFieldName = fieldName;
          }
        }
      }

      if (!samplingDateFieldName) {
        samplingDateFieldName = FileService.detectField(fieldNames, ['date', 'time'], true);
      }

      if (!geometryDetected) {
        // Try to detect geometry field name
        geometryFieldName = FileService.detectField(fieldNames, ['geom', 'geometry', 'shape', 'wkb'], true);
      }

      // Try to detect other fields
      latitudeFieldName = FileService.detectField(fieldNames, ['latitude', 'lat'], true);
      if (!latitudeFieldName) {
        latitudeFieldName = FileService.detectField(fieldNames, ['y'], false); // No partial match
      }
      longitudeFieldName = FileService.detectField(fieldNames, ['longitude', 'lon', 'lng'], true);
      if (!longitudeFieldName) {
        longitudeFieldName = FileService.detectField(fieldNames, ['x'], false); // No partial match
      }
      licenseFieldName = FileService.detectField(fieldNames, ['license', 'licence', 'lic', 'copyright', 'attribution'], true);
      minDepthFieldName = FileService.detectField(fieldNames, ['mindepth', 'upperdepth', 'upperhorizon'], true);
      maxDepthFieldName = FileService.detectField(fieldNames, ['maxdepth', 'lowerdepth', 'lowerhorizon'], true);
      if (!minDepthFieldName && !maxDepthFieldName) {
        depthFieldName = FileService.detectField(fieldNames, ['depth'], true);
      }
      horizonFieldName = FileService.detectField(fieldNames, ['horizon', 'layername'], true);

      // Get CRS/SRID
      let crsString: string | null = null;
      try {
        const spatialRef = layer.srs;
        if (spatialRef) {
          const epsgCode = spatialRef.getAttrValue('AUTHORITY', 1);
          if (epsgCode) {
            crsString = `EPSG:${epsgCode}`;
          } else {
            crsString = spatialRef.toWKT();
          }
        }
      } catch {
        // Ignore CRS errors
      }

      const metadata: FileMetadata = {
        field_names: fieldNames,
        detected_fields: {
          [DetectableFields.GEOMETRY]: geometryFieldName,
          [DetectableFields.LICENSE]: licenseFieldName,
          [DetectableFields.SAMPLING_DATE]: samplingDateFieldName,
          [DetectableFields.DEPTH]: depthFieldName,
          [DetectableFields.MIN_DEPTH]: minDepthFieldName,
          [DetectableFields.MAX_DEPTH]: maxDepthFieldName,
          [DetectableFields.HORIZON]: horizonFieldName,
          [DetectableFields.CRS]: crsString,
          [DetectableFields.LATITUDE]: latitudeFieldName,
          [DetectableFields.LONGITUDE]: longitudeFieldName,
        },
        geometry_detected: geometryDetected,
      };

      return metadata;
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to extract metadata: ${error}`, StatusCodes.BAD_REQUEST);
    } finally {
      // Clean up temporary directory if ZIP was extracted
      if (tempZipExtractPath) {
        FileService.removeTempFolder(tempZipExtractPath);
      }
    }
  };
}
