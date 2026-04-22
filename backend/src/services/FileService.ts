import { StatusCodes } from 'http-status-codes';
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
import { File, FileMetadata, ExtractedFilePath } from '../interfaces/File';
import { ErrorResponse } from '../utils/error';
import { getEntity } from '../utils/slugs';
import { sanitizeField, buildDatedFileKey, getRawTableName } from '../utils/utils';
import { StorageModes } from '../types/enums';
import { EntityType, IngestionStatus } from '../types/data';
import { DataMappingObject, DetectableFields } from '../types/DataMapping';
import ConfigService from './ConfigService';
import FileEntity from '../entities/File';
import assert from 'assert';
import { getDBPassword } from '../utils/db-credentials';
import DataMappingService from './DataMappingService';

const dataMappingService = new DataMappingService();

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

const unknownGeomDrivers = ['CSV', 'XLSX'];

export default class FileService {
  exists = async (fileKey: string): Promise<boolean> => {
    const storage = FileService.getStorageEngine();
    return await storage.fileExists(fileKey);
  };

  deleteFileFromStorage = async (fileKey: string): Promise<void> => {
    const storage = FileService.getStorageEngine();
    await storage.deleteFile(fileKey);
  };

  static getUploadStorageEngine = (): FlystorageMulterStorageEngine => {
    // TODO: implement logic to check for available storage space if StorageModes.LOCAL and handle related errors properly
    const adapter = this.getAdapter();
    const fileStorage = new FileStorage(adapter);
    const storage = new FlystorageMulterStorageEngine(fileStorage, async (action, req, file) => {
      if (action === 'handle') {
        const destination = buildDatedFileKey(file.originalname);
        const uploadedFileInfo = {
          originalname: file.originalname,
          fileKey: destination,
        };
        req.customData = req.customData || {};
        req.customData.uploadedFileInfo = uploadedFileInfo;
        return destination;
      } else {
        // Return folder name/destination if needed
        return file.destination;
      }
    });
    return storage;
  };

  static getStorageEngine = (): FileStorage => {
    const adapter = this.getAdapter();
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
        const s3Client = new S3Client({
          region: s3Config.region,
          ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
          ...(s3Config.credentials ? { credentials: s3Config.credentials } : {}),
        }) as any;
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

  getFiles = async (requestData: RequestData): Promise<FileEntity[]> => {
    const repo = requestData.entityManager.getRepository(FileEntity);
    return await repo.find();
  };

  getFile = async (requestData: RequestData, slug: string): Promise<FileEntity> => {
    return await getEntity(requestData, FileEntity, EntityType.FILE, slug);
  };

  createFile = async (requestData: RequestData, data: Partial<File>): Promise<FileEntity> => {
    const repo = requestData.entityManager.getRepository(FileEntity);
    const { sub } = requestData.token ?? {};

    assert(data.file_path, 'file_path is required to create a file');
    const metadata = await this.extractMetadata(requestData, data.file_path);

    const file = repo.create({
      ...data,
      metadata,
      status: IngestionStatus.PENDING,
      created_by: String(sub),
      updated_by: String(sub),
    });

    try {
      const saved = await repo.save(file);
      const reloaded = await repo.findOneBy({ id: saved.id });
      return reloaded!;
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(`File with name '${data.name}' already exists`, StatusCodes.CONFLICT);
      }
      throw error;
    }
  };

  updateFile = async (requestData: RequestData, slug: string, data: Partial<File>): Promise<FileEntity> => {
    const repo = requestData.entityManager.getRepository(FileEntity);
    const { sub } = requestData.token ?? {};

    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);

    repo.merge(file, {
      ...data,
      updated_by: String(sub),
      updated_at: new Date(),
    });

    const saved = await repo.save(file);
    const reloaded = await repo.findOneBy({ id: saved.id });
    return reloaded!;
  };

  deleteFile = async (requestData: RequestData, slug: string): Promise<void> => {
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);
    await requestData.entityManager.getRepository(FileEntity).softRemove(file);
  };

  /**
   * Extracts ZIP file to a temporary directory and finds the main data file
   * Looks for common geospatial file extensions in order: .shp, .gpkg, .geojson, .gml, .kml
   */
  private static extractZipAndFindMainFile = async (zipPath: string): Promise<{ tempZipExtractPath: string; mainFilePath: string }> => {
    const tempZipExtractPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gdal-zip-tmp'));

    try {
      // Extract ZIP to temporary directory using extract-zip
      await extractZip(zipPath, { dir: tempZipExtractPath });

      const files = fs.readdirSync(tempZipExtractPath);
      if (files.length === 1) {
        // Only one file, return it
        const mainFilePath = path.join(tempZipExtractPath, files[0]!);
        return { tempZipExtractPath, mainFilePath };
      }

      // Find main data file with common geospatial extensions
      const extensions = ['.shp', '.gpkg', '.geojson', '.gml', '.kml', '.gdb'];

      for (const ext of extensions) {
        for (const file of files) {
          if (file.toLowerCase().endsWith(ext)) {
            const mainFilePath = path.join(tempZipExtractPath, file);
            return { tempZipExtractPath, mainFilePath };
          }
        }
      }

      throw new ErrorResponse(
        'No recognized geospatial file found in ZIP archive (expected .shp, .gpkg, .geojson, .gml, or .kml)',
        StatusCodes.BAD_REQUEST,
      );
    } catch (error) {
      // Clean up on error
      this.removeTempFolder(tempZipExtractPath);
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
      const cleanField = sanitizeField(field, true);
      if (expected.includes(cleanField)) {
        return field;
      }
    }
    if (!partialMatch) {
      return null;
    }
    for (const field of fields) {
      const cleanField = sanitizeField(field, true);
      for (const p of expected) {
        if (cleanField.includes(p)) {
          return field;
        }
      }
    }
    return null;
  };

  private static getMainFilePath = async (fileKey: string): Promise<ExtractedFilePath> => {
    const config: StorageConfig = ConfigService.getStorageConfig();
    let mainFilePath: string;
    let tempZipExtractPath: string | null = null;

    try {
      // Get dataset path based on storage mode
      if (config.storageMode === StorageModes.LOCAL) {
        const localConfig = config.config as LocalStorageConfig;
        mainFilePath = path.join(localConfig.rootFolder, fileKey);
        if (!fs.existsSync(mainFilePath)) {
          throw new ErrorResponse(`File ${mainFilePath} not found`, StatusCodes.NOT_FOUND);
        }

        // Handle ZIP files
        if (fileKey.toLowerCase().endsWith('.zip')) {
          ({ tempZipExtractPath, mainFilePath } = await this.extractZipAndFindMainFile(mainFilePath));
        }
      } else if (config.storageMode === StorageModes.S3) {
        // For S3, we would need to download the file first to extract it
        // For now, use GDAL's S3 VSI support (which may not support ZIP)
        const s3Config = config.config as S3StorageConfig;
        const key = s3Config.rootFolder ? `${s3Config.rootFolder}/${fileKey}` : fileKey;
        mainFilePath = `/vsis3/${s3Config.bucketName}/${key}`;

        // If it's a ZIP file on S3, we'd need to handle it differently
        // For now, this will be attempted directly with GDAL
      } else {
        throw new ErrorResponse(`Unsupported storage mode: ${config.storageMode}`, StatusCodes.INTERNAL_SERVER_ERROR);
      }

      const result: ExtractedFilePath = {
        mainFilePath,
        tempZipExtractPath,
      };
      return result;
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to extract file path: ${error}`, StatusCodes.BAD_REQUEST);
    }
  };

  getDataLayer = (layers: gdal.DatasetLayers, allowWkbUnknown: boolean = false): { layer: gdal.Layer; geometryDetected: boolean } => {
    let layer: gdal.Layer | null = null;
    let geometryDetected = false;

    for (let i = 0; i < layers.count(); i++) {
      const currentLayer = layers.get(i);
      // Check that layer contains point or polygon geometry
      let layerGeometry = currentLayer.geomType;

      if (!layerGeometry && layerGeometry !== 0) {
        continue;
      }
      geometryDetected = layerGeometry !== gdal.wkbNone;
      if (allowWkbUnknown && layerGeometry === gdal.wkbUnknown) {
        const firstGeom = currentLayer.features.first()?.getGeometry();
        if (!firstGeom) {
          continue;
        }
        layerGeometry = firstGeom.wkbType;
      }
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
    return { layer, geometryDetected };
  };

  getDetectedMapping(fieldNames: string[], mappings: DataMappingObject[]): DataMappingObject {
    const output: DataMappingObject = {};

    for (const fieldName of fieldNames) {
      for (const mapping of mappings) {
        const current = mapping[fieldName];
        if (!current) {
          continue;
        }
        if (!output[fieldName]) {
          // First match
          output[fieldName] = current;
        } else if (typeof current === 'object' && typeof output[fieldName] === 'string' && Object.keys(current).length > 0) {
          // Replace string match with object match
          output[fieldName] = current;
        } else if (
          typeof current === 'object' &&
          typeof output[fieldName] === 'object' &&
          Object.keys(current).length > Object.keys(output[fieldName]).length
        ) {
          // Replace match if a one with more information is found
          output[fieldName] = current;
        }
      }
    }
    return output;
  }

  async extractMetadata(requestData: RequestData, fileKey: string): Promise<FileMetadata> {
    let mainFilePath: string;
    let tempZipExtractPath: string | null = null;
    try {
      ({ mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(fileKey));

      // Open dataset with GDAL
      const dataset = await gdal.openAsync(mainFilePath);
      const driver = dataset.driver.description;
      const { layer, geometryDetected } = this.getDataLayer(dataset.layers, unknownGeomDrivers.includes(driver));

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
      let epsg: number | undefined = undefined;
      try {
        const spatialRef = layer.srs;
        if (spatialRef) {
          const epsgString = spatialRef.getAttrValue('AUTHORITY', 1);
          if (!isNaN(Number(epsgString))) {
            epsg = parseInt(epsgString, 10);
          }
        }
      } catch {
        // Ignore CRS errors
      }
      dataset.close();

      // Get all previous mappings
      const mappings: DataMappingObject[] = (await dataMappingService.getDataMappings(requestData)).map(dm => dm.data_mapping);
      const detected_mapping: DataMappingObject = await this.getDetectedMapping(fieldNames, mappings);

      const metadata: FileMetadata = {
        field_names: fieldNames,
        detected_mapping,
        detected_fields: {
          [DetectableFields.GEOMETRY]: geometryFieldName,
          [DetectableFields.LICENSE]: licenseFieldName,
          [DetectableFields.SAMPLING_DATE]: samplingDateFieldName,
          [DetectableFields.DEPTH]: depthFieldName,
          [DetectableFields.MIN_DEPTH]: minDepthFieldName,
          [DetectableFields.MAX_DEPTH]: maxDepthFieldName,
          [DetectableFields.HORIZON]: horizonFieldName,
          [DetectableFields.LATITUDE]: latitudeFieldName,
          [DetectableFields.LONGITUDE]: longitudeFieldName,
        },
        geometry_detected: geometryDetected,
        driver,
        ...(epsg && { epsg }),
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
  }

  fileToDB = async (requestData: RequestData, fileId: string) => {
    const fileEntity = await this.getFile(requestData, fileId);
    assert(fileEntity.file_path, `File path not found for file ${fileId}`);
    assert(fileEntity.metadata, `Metadata not found for file ${fileId}`);
    const fileKey = fileEntity.file_path!;
    const fileMetadata = fileEntity.metadata!;
    let mainFilePath: string;
    let tempZipExtractPath: string | null = null;
    const gdalOpts: string[] = [
      '-f',
      'PostgreSQL',
      '-explodecollections',
      '-t_srs',
      'EPSG:4326',
      '-lco',
      'FID=record_id',
      '-lco',
      'SPATIAL_INDEX=NONE',
      '-lco',
      'LAUNDER=NO',
      '-lco',
      'GEOM_TYPE=geometry',
      '-lco',
      'GEOMETRY_NAME=geometry',
    ];
    const openOpts: string[] = ['AUTODETECT_TYPE=YES', 'EMPTY_STRING_AS_NULL=YES', 'KEEP_GEOM_COLUMNS=NO'];
    const tableName = getRawTableName(fileEntity.id);
    gdalOpts.push('-nln', tableName);
    const originalGeomFields = [
      fileMetadata.detected_fields[DetectableFields.GEOMETRY],
      fileMetadata.detected_fields[DetectableFields.LONGITUDE],
      fileMetadata.detected_fields[DetectableFields.LATITUDE],
    ];
    let selectClause = fileMetadata.field_names
      .filter(item => !originalGeomFields.includes(item))
      .map(field => `"${field}" AS ${sanitizeField(field)}`)
      .join(', ');

    try {
      if (fileMetadata.field_names.length === 0) {
        throw new ErrorResponse('No data besides geometry detected', StatusCodes.BAD_REQUEST);
      }
      ({ mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(fileKey));

      if (!fileMetadata.geometry_detected) {
        if (fileMetadata.detected_fields[DetectableFields.GEOMETRY]) {
          openOpts.push(`GEOM_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.GEOMETRY]}`);
          selectClause = `${selectClause}, "${fileMetadata.detected_fields[DetectableFields.GEOMETRY]}" AS geometry`;
        } else if (fileMetadata.detected_fields[DetectableFields.LATITUDE] && fileMetadata.detected_fields[DetectableFields.LONGITUDE]) {
          openOpts.push(
            `X_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.LONGITUDE]}`,
            `Y_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.LATITUDE]}`,
          );
          selectClause = `${selectClause}, "_ogr_geometry_" AS geometry`;
        } else {
          throw new ErrorResponse('Geometry not found in input file', StatusCodes.BAD_REQUEST);
        }
      }

      const srs = `EPSG:${fileMetadata.epsg ?? 4326}`;
      gdalOpts.push('-s_srs', srs);
      // Open dataset with GDAL (if driver available, pass driver-specific open options)
      let dataset: gdal.Dataset;
      if (fileMetadata.driver) {
        const driver = gdal.drivers.get(fileMetadata.driver);
        dataset = driver.open(mainFilePath, 'r+', openOpts);
      } else {
        dataset = gdal.open(mainFilePath);
      }

      const { layer } = this.getDataLayer(dataset.layers, unknownGeomDrivers.includes(fileMetadata.driver ? fileMetadata.driver : ''));
      if (fileMetadata.geometry_detected && layer.geomColumn) {
        selectClause = `${selectClause}, ${layer.geomColumn} as geometry`;
      }

      gdalOpts.push('-sql', `SELECT ${selectClause} FROM "${layer.name}"`);
      const bundleFile = path.join(__dirname, '..', 'assets', 'global-bundle.pem');
      const sslOpts = `sslmode=verify-full sslrootcert=${bundleFile}`;
      const pgDataset =
        `PG:host=${process.env.POSTGRES_HOST} port=${process.env.POSTGRES_PORT} user=${process.env.POSTGRES_USER} dbname=${process.env.POSTGRES_DB} password=${await getDBPassword()} ${process.env.POSTGRES_PASSWORD ? '' : sslOpts} schemas=${process.env.POSTGRES_SCHEMA}`.replace(
          /\n/g,
          ' ',
        );
      gdalOpts.unshift(layer.name);
      await gdal.vectorTranslateAsync(pgDataset, dataset, gdalOpts);
      dataset.close();
    } catch (error) {
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to load file to table: ${error}`, StatusCodes.BAD_REQUEST);
    } finally {
      // Clean up temporary directory if ZIP was extracted
      if (tempZipExtractPath) {
        FileService.removeTempFolder(tempZipExtractPath);
      }
    }
  };
}
