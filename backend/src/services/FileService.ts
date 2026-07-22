import { StatusCodes } from 'http-status-codes';
import fs from 'fs';
import path from 'path';
import os from 'os';
import extractZip from 'extract-zip';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileStorage } from '@flystorage/file-storage';
import { AwsS3StorageAdapter } from '@flystorage/aws-s3';
import { LocalStorageAdapter } from '@flystorage/local-fs';
import { FlystorageMulterStorageEngine } from '@flystorage/multer-storage';
import { GdalCLI, OgrInfoLayer, GdalInfoOutput } from '../utils/GdalCLI';
import { LocalStorageConfig, S3StorageConfig, StorageConfig } from '../interfaces/StorageConfig';
import { RequestData } from '../interfaces/RequestData';
import { File, FileMetadata, RasterBandMetadata, ExtractedFilePath } from '../interfaces/File';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { getSubject } from '../utils/auth';
import { getEntity } from '../utils/slugs';
import { sanitizeField, buildDatedFileKey, getRawTableName } from '../utils/utils';
import { StorageModes } from '../types/enums';
import { EntityType, IngestionStatus } from '../types/data';
import { DataMappingObject, DetectableFields } from '../types/DataMapping';
import ConfigService from './ConfigService';
import FileEntity from '../entities/File';
import assert from 'assert';
import { JobError } from '../errors/JobError';
import { getDBPassword } from '../utils/db-credentials';
import { log } from '../utils/logger';
import { bumpCacheEpoch } from '../utils/cache-epoch';
import DataMappingService from './DataMappingService';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import { EntityManager } from 'node_modules/typeorm';

const dataMappingService = new DataMappingService();

const ALLOWED_GEOMETRY_TYPES = new Set([
  'None', // Tabular file support
  'Geometry', // Generic geometry support
  'Point',
  'Point Z',
  'Point M',
  'Point ZM',
  '3D Point',
  'Multi Point',
  'Multi Point Z',
  'Multi Point M',
  'Multi Point ZM',
  '3D Multi Point',
  'Polygon',
  'Polygon Z',
  'Polygon M',
  'Polygon ZM',
  '3D Polygon',
  'Multi Polygon',
  'Multi Polygon Z',
  'Multi Polygon M',
  'Multi Polygon ZM',
  '3D Multi Polygon',
]);

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
    const subject = getSubject(requestData);

    assert(data.file_path, 'file_path is required to create a file');
    const metadata = await this.extractMetadata(requestData, data.file_path);

    const file = repo.create({
      ...data,
      metadata,
      status: IngestionStatus.PENDING,
      created_by: subject,
      updated_by: subject,
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
    const subject = getSubject(requestData);

    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);

    repo.merge(file, {
      ...data,
      updated_by: subject,
      updated_at: new Date(),
    });

    const saved = await repo.save(file);
    const reloaded = await repo.findOneBy({ id: saved.id });
    return reloaded!;
  };

  deleteFile = async (requestData: RequestData, slug: string): Promise<void> => {
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);
    await requestData.entityManager.getRepository(FileEntity).softRemove(file);
    // Raster filter queries join on files (f.deleted_at IS NULL); see docs/adr/0008.
    await bumpCacheEpoch();
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

  // The XLSX driver does not support X_POSSIBLE_NAMES / Y_POSSIBLE_NAMES open options (CSV-only).
  // Wrapping the source in a VRT lets GDAL construct point geometry from lat/lon columns before
  // ogr2ogr sees it, so no driver-specific open options are needed.
  private static createPointVrt(srcPath: string, layerName: string, xField: string, yField: string): string {
    const vrtPath = path.join(os.tmpdir(), `${path.basename(srcPath, path.extname(srcPath))}-${Date.now()}.vrt`);
    const content = `<OGRVRTDataSource>
  <OGRVRTLayer name="${layerName}">
    <SrcDataSource>${srcPath}</SrcDataSource>
    <SrcLayer>${layerName}</SrcLayer>
    <OpenOptions>
      <OOI key="HEADERS">FORCE</OOI>
    </OpenOptions>
    <GeometryType>wkbPoint</GeometryType>
    <GeometryField encoding="PointFromColumns" x="${xField}" y="${yField}"/>
  </OGRVRTLayer>
</OGRVRTDataSource>`;
    fs.writeFileSync(vrtPath, content, 'utf8');
    return vrtPath;
  }

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

  static getMainFilePath = async (fileKey: string): Promise<ExtractedFilePath> => {
    const config: StorageConfig = ConfigService.getStorageConfig();
    let mainFilePath: string;
    let tempZipExtractPath: string | null = null;

    try {
      // Get dataset path based on storage mode
      if (config.storageMode === StorageModes.LOCAL) {
        const localConfig = config.config as LocalStorageConfig;
        mainFilePath = path.isAbsolute(fileKey) ? fileKey : path.join(localConfig.rootFolder, fileKey);
        if (!fs.existsSync(mainFilePath)) {
          throw new ErrorResponse(`File ${mainFilePath} not found`, StatusCodes.NOT_FOUND);
        }

        // Handle ZIP files
        if (fileKey.toLowerCase().endsWith('.zip')) {
          ({ tempZipExtractPath, mainFilePath } = await this.extractZipAndFindMainFile(mainFilePath));
        }
      } else if (config.storageMode === StorageModes.S3) {
        // For S3, use GDAL's S3 VSI support + VSIZIP to handle ZIP files directly from S3 without downloading.
        // This requires the S3 bucket to allow range requests.
        const isZip = fileKey.toLowerCase().endsWith('.zip');
        const vsiPrefix = isZip ? '/vsizip/vsis3/' : '/vsis3/';
        const s3Config = config.config as S3StorageConfig;
        const key = s3Config.rootFolder ? `${s3Config.rootFolder}/${fileKey}` : fileKey;
        mainFilePath = `${vsiPrefix}${s3Config.bucketName}/${key}`;
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

  static getPresignedUrl = async (fileKey: string, expiresIn = 3600): Promise<string> => {
    const config: StorageConfig = ConfigService.getStorageConfig();
    if (config.storageMode !== StorageModes.S3) {
      throw new ErrorResponse('getPresignedUrl is only supported for S3 storage mode', StatusCodes.INTERNAL_SERVER_ERROR);
    }
    const s3Config = config.config as S3StorageConfig;
    const s3Client = new S3Client({
      region: s3Config.region,
      ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
      ...(s3Config.credentials ? { credentials: s3Config.credentials } : {}),
    });
    const key = s3Config.rootFolder ? `${s3Config.rootFolder}/${fileKey}` : fileKey;
    const command = new GetObjectCommand({ Bucket: s3Config.bucketName, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn });
  };

  getDataLayer = (layers: OgrInfoLayer[], allowUnknownGeometry: boolean = false): { layer: OgrInfoLayer; geometryDetected: boolean } => {
    let layer: OgrInfoLayer | null = null;
    let geometryDetected = false;

    for (const currentLayer of layers) {
      const geomType = currentLayer.geometry ?? 'None';

      if (geomType === 'Unknown (any)') {
        if (!allowUnknownGeometry) continue;
        geometryDetected = true;
        layer = currentLayer;
        break;
      }

      geometryDetected = geomType !== 'None';

      if (!ALLOWED_GEOMETRY_TYPES.has(geomType)) continue;

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

    // null featureCount means "unknown": throw only if it's explicitly 0
    if (layer.featureCount === 0) {
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
    // ZIPs are always vector bundles in this codebase, so skip the raster probe entirely
    if (fileKey.toLowerCase().endsWith('.zip')) {
      return this.extractVectorMetadata(requestData, fileKey);
    }

    const { mainFilePath } = await FileService.getMainFilePath(fileKey);

    let gdalInfo: GdalInfoOutput | undefined;
    try {
      gdalInfo = await GdalCLI.gdalinfo(mainFilePath);
    } catch (error) {
      // GDAL is a hard deployment dependency (see ADR 0004 and ADR 0014): if gdalinfo can't even run,
      // the vector path would fail identically, so surface this failure directly instead of falling through.
      if (getErrorMessage(error).startsWith('GDAL_NOT_INSTALLED')) {
        throw new ErrorResponse(`Failed to extract metadata: ${error}`, StatusCodes.BAD_REQUEST);
      }
    }

    if (gdalInfo && (gdalInfo.bands?.length ?? 0) > 0) {
      return this.extractRasterMetadata(fileKey, gdalInfo);
    }

    return this.extractVectorMetadata(requestData, fileKey);
  }

  private async extractVectorMetadata(requestData: RequestData, fileKey: string): Promise<FileMetadata> {
    let mainFilePath: string;
    let tempZipExtractPath: string | null = null;
    try {
      ({ mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(fileKey));

      log.info('Extracting metadata with ogrinfo', { source: mainFilePath });
      const isExcel = ['.xlsx', '.xls'].includes(path.extname(mainFilePath).toLowerCase());
      const { driver, layers } = await GdalCLI.ogrinfo(
        mainFilePath,
        isExcel ? ['GEOM_POSSIBLE_NAMES=*', 'HEADERS=FORCE'] : ['GEOM_POSSIBLE_NAMES=*'],
      );

      log.info('Getting data layer and detecting geometry', { driver });
      const { layer, geometryDetected } = this.getDataLayer(layers, unknownGeomDrivers.includes(driver));

      const fieldNames = layer.fields.map(f => f.name);
      let geometryFieldName: string | null = null;
      let latitudeFieldName: string | null = null;
      let longitudeFieldName: string | null = null;
      let samplingDateFieldName: string | null = null;
      let licenseFieldName: string | null = null;
      let depthFieldName: string | null = null;
      let minDepthFieldName: string | null = null;
      let maxDepthFieldName: string | null = null;
      let horizonFieldName: string | null = null;

      for (const field of layer.fields) {
        if (field.type === 'Date' || field.type === 'DateTime') {
          if (!samplingDateFieldName) samplingDateFieldName = field.name;
        }
      }

      if (!samplingDateFieldName) {
        samplingDateFieldName = FileService.detectField(fieldNames, ['date', 'time'], true);
      }

      geometryFieldName = layer.geomColumn ?? FileService.detectField(fieldNames, ['geom', 'geometry', 'shape', 'wkb', 'wkt'], true);

      latitudeFieldName = FileService.detectField(fieldNames, ['latitude', 'lat'], true);
      if (!latitudeFieldName) {
        latitudeFieldName = FileService.detectField(fieldNames, ['y'], false);
      }
      longitudeFieldName = FileService.detectField(fieldNames, ['longitude', 'lon', 'lng'], true);
      if (!longitudeFieldName) {
        longitudeFieldName = FileService.detectField(fieldNames, ['x'], false);
      }
      licenseFieldName = FileService.detectField(fieldNames, ['license', 'licence', 'lic', 'copyright', 'attribution'], true);
      minDepthFieldName = FileService.detectField(fieldNames, ['mindepth', 'upperdepth', 'upperhorizon', 'depthtop'], true);
      maxDepthFieldName = FileService.detectField(fieldNames, ['maxdepth', 'lowerdepth', 'lowerhorizon', 'depthbottom'], true);
      if (!minDepthFieldName && !maxDepthFieldName) {
        depthFieldName = FileService.detectField(fieldNames, ['depth'], true);
      }
      horizonFieldName = FileService.detectField(fieldNames, ['horizon', 'layername'], true);

      const mappings: DataMappingObject[] = (await dataMappingService.getDataMappings(requestData)).map(dm => dm.data_mapping);
      const detected_mapping: DataMappingObject = this.getDetectedMapping(fieldNames, mappings);

      const metadata: FileMetadata = {
        is_raster: false,
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
        layer_name: layer.name,
        ...(layer.geomColumn && { geom_column: layer.geomColumn }),
        ...(layer.epsg && { epsg: layer.epsg }),
      };

      return metadata;
    } catch (error) {
      log.error('Failed to extract metadata', {
        fileKey,
        error: JSON.stringify(error),
      });
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to extract metadata: ${error}`, StatusCodes.BAD_REQUEST);
    } finally {
      if (tempZipExtractPath) {
        FileService.removeTempFolder(tempZipExtractPath);
      }
    }
  }

  private async extractRasterMetadata(fileKey: string, gdalInfo: GdalInfoOutput): Promise<FileMetadata> {
    assert(!fileKey.toLowerCase().endsWith('.zip'), 'Raster ZIP files are not supported');
    try {
      const { mainFilePath } = await FileService.getMainFilePath(fileKey);
      log.info('Extracting raster metadata from gdalinfo', { source: mainFilePath });

      const raster_bands: RasterBandMetadata[] = (gdalInfo.bands ?? []).map(band => ({
        band_number: band.band ?? 0,
        data_type: band.type ?? '',
        ...(band.min !== undefined && { min_value: band.min }),
        ...(band.max !== undefined && { max_value: band.max }),
        ...(band.noDataValue !== undefined && { no_data_value: band.noDataValue }),
        ...(band.overviews !== undefined && { overviews: band.overviews.map(ov => [ov.size.x, ov.size.y]) }),
      }));

      const epsg = GdalCLI.extractEpsgFromWkt(gdalInfo.coordinateSystem?.wkt);
      const extent = FileService.extractWgs84Extent(gdalInfo.wgs84Extent);
      const size: [number, number] = gdalInfo.size ?? [0, 0];

      const metadata: FileMetadata = {
        is_raster: true,
        size,
        band_count: raster_bands.length,
        raster_bands,
        ...(gdalInfo.driverShortName && { driver: gdalInfo.driverShortName }),
        ...(epsg !== undefined && { epsg }),
        ...(extent && { extent }),
      };

      return metadata;
    } catch (error) {
      log.error('Failed to extract raster metadata', {
        fileKey,
        error: JSON.stringify(error),
      });
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to extract metadata: ${error}`, StatusCodes.BAD_REQUEST);
    }
  }

  private static extractWgs84Extent(wgs84Extent?: { coordinates: number[][][] }): [number, number, number, number] | undefined {
    const ring = wgs84Extent?.coordinates?.[0];
    if (!ring || ring.length === 0) return undefined;
    const lons = ring.map(([lon]) => lon!);
    const lats = ring.map(([, lat]) => lat!);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }

  fileToDB = async (requestData: RequestData, fileId: string) => {
    const fileEntity = await this.getFile(requestData, fileId);
    assert(fileEntity.file_path, `File path not found for file ${fileId}`);
    assert(fileEntity.metadata, `Metadata not found for file ${fileId}`);
    if (fileEntity.metadata.is_raster) {
      throw new JobError('FTD_RASTER_NOT_SUPPORTED');
    }
    if (!fileEntity.metadata.layer_name) {
      throw new JobError('FTD_MISSING_LAYER_NAME');
    }

    const repo = requestData.entityManager.getRepository(FileEntity);
    await repo.update(fileEntity.id, { status: IngestionStatus.ONGOING });

    const fileKey = fileEntity.file_path!;
    const fileMetadata = fileEntity.metadata!;
    assert(!fileMetadata.is_raster, `Metadata is raster for file ${fileId}`);
    const layerName = fileMetadata.layer_name!;

    const mappingRepo = requestData.entityManager.getRepository(DatasetFileMappingEntity);
    const datasetFileMapping = await mappingRepo.findOne({
      where: { file_id: fileEntity.id },
      relations: ['data_mapping'],
    });
    const mapping: DataMappingObject | undefined = datasetFileMapping?.data_mapping?.data_mapping;

    const mappingGeomFields = await this.extractGeomFieldsFromMapping(mapping);

    let mainFilePath: string;
    let tempZipExtractPath: string | null = null;
    let tempVrtPath: string | null = null;
    const tableName = getRawTableName(fileEntity.id);
    const ogr2ogrOpts: string[] = [
      '-f',
      'PostgreSQL',
      '-explodecollections',
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
      '-nln',
      tableName,
    ];

    const originalGeomFields = [
      fileMetadata.detected_fields[DetectableFields.GEOMETRY],
      fileMetadata.detected_fields[DetectableFields.LONGITUDE],
      fileMetadata.detected_fields[DetectableFields.LATITUDE],
      mappingGeomFields.geomField,
      mappingGeomFields.lonField,
      mappingGeomFields.latField,
    ].map(item => item?.toLowerCase());
    let mappingNonGeomFields: string[];
    if (mapping) {
      mappingNonGeomFields = Object.keys(mapping).filter(item => !originalGeomFields.includes(item.toLowerCase()));
    } else {
      mappingNonGeomFields = fileMetadata.field_names.filter(item => !originalGeomFields.includes(item.toLowerCase()));
    }
    let selectClause = mappingNonGeomFields.map(field => `"${field}" AS ${sanitizeField(field)}`).join(', ');

    try {
      if (mappingNonGeomFields.length === 0) {
        throw new JobError('FTD_NO_DATA_COLUMNS');
      }
      try {
        ({ mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(fileKey));
      } catch (err) {
        if (err instanceof ErrorResponse && err.status === StatusCodes.NOT_FOUND) {
          throw new JobError('FTD_FILE_NOT_FOUND');
        }
        throw err;
      }

      let keepGeomColumn = 'YES';

      if (!fileMetadata.geometry_detected) {
        if (mappingGeomFields.geomField) {
          ogr2ogrOpts.push('-oo', `GEOM_POSSIBLE_NAMES=${mappingGeomFields.geomField}`);
          selectClause = `${selectClause}, "${mappingGeomFields.geomField}" AS geometry`;
          keepGeomColumn = 'NO';
        } else if (mappingGeomFields.latField && mappingGeomFields.lonField) {
          if (fileMetadata.driver === 'XLSX') {
            tempVrtPath = FileService.createPointVrt(mainFilePath, layerName, mappingGeomFields.lonField, mappingGeomFields.latField);
          } else {
            ogr2ogrOpts.push(
              '-oo',
              `X_POSSIBLE_NAMES=${mappingGeomFields.lonField}`,
              '-oo',
              `Y_POSSIBLE_NAMES=${mappingGeomFields.latField}`,
            );
            selectClause = `${selectClause}, "_ogr_geometry_" AS geometry`;
          }
        } else if (fileMetadata.detected_fields[DetectableFields.GEOMETRY]) {
          ogr2ogrOpts.push('-oo', `GEOM_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.GEOMETRY]}`);
          selectClause = `${selectClause}, "${fileMetadata.detected_fields[DetectableFields.GEOMETRY]}" AS geometry`;
          keepGeomColumn = 'NO';
        } else if (fileMetadata.detected_fields[DetectableFields.LATITUDE] && fileMetadata.detected_fields[DetectableFields.LONGITUDE]) {
          if (fileMetadata.driver === 'XLSX') {
            tempVrtPath = FileService.createPointVrt(
              mainFilePath,
              layerName,
              fileMetadata.detected_fields[DetectableFields.LONGITUDE],
              fileMetadata.detected_fields[DetectableFields.LATITUDE],
            );
          } else {
            ogr2ogrOpts.push(
              '-oo',
              `X_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.LONGITUDE]}`,
              '-oo',
              `Y_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.LATITUDE]}`,
            );
            selectClause = `${selectClause}, "_ogr_geometry_" AS geometry`;
          }
        } else {
          throw new ErrorResponse(
            'Geometry not found: no geometry column in user mapping or auto-detected fields',
            StatusCodes.BAD_REQUEST,
          );
        }
      }

      if (fileMetadata.driver === 'XLSX') {
        ogr2ogrOpts.push('-oo', 'HEADERS=FORCE');
      }

      if (fileMetadata.epsg && fileMetadata.epsg !== 4326) {
        // Reproject from the declared non-WGS84 source CRS to WGS84.
        ogr2ogrOpts.push('-s_srs', `EPSG:${fileMetadata.epsg}`);
        ogr2ogrOpts.push('-t_srs', 'EPSG:4326');
      } else {
        // Source is WGS84 or CRS unknown (assumed WGS84): assign SRID without reprojecting.
        // -a_srs avoids GDAL 3.10.x's PostgreSQL driver spurious coordinate shift that occurs
        // when -s_srs EPSG:4326 is combined with -t_srs EPSG:4326 on a null-SRS CSV layer.
        ogr2ogrOpts.push('-a_srs', 'EPSG:4326');
      }

      if (fileMetadata.geometry_detected && fileMetadata.geom_column) {
        if (unknownGeomDrivers.includes(fileMetadata.driver ?? '')) {
          // CSV/XLSX: re-open with the sniffed column as geometry. A column literally
          // named "WKT" becomes an unnamed OGR geometry field that cannot be referenced
          // in SQL; OGR SQL passes the geometry through implicitly instead.
          ogr2ogrOpts.push('-oo', `GEOM_POSSIBLE_NAMES=${fileMetadata.geom_column}`);
          keepGeomColumn = 'NO';
        } else {
          // e.g. GPKG executes -sql natively (SQLite), where geometry must be selected explicitly.
          selectClause = `${selectClause}, "${fileMetadata.geom_column}" as geometry`;
        }
      }

      if (unknownGeomDrivers.includes(fileMetadata.driver ?? '')) {
        ogr2ogrOpts.push('-oo', 'AUTODETECT_TYPE=YES', '-oo', 'EMPTY_STRING_AS_NULL=YES', '-oo', `KEEP_GEOM_COLUMNS=${keepGeomColumn}`);
      }

      ogr2ogrOpts.push('-sql', `SELECT ${selectClause} FROM "${layerName}"`);

      const bundleFile = path.join(__dirname, '..', 'assets', 'global-bundle.pem');
      const sslOpts = `sslmode=verify-full sslrootcert=${bundleFile}`;
      const pgDataset =
        `PG:host=${process.env.POSTGRES_HOST} port=${process.env.POSTGRES_PORT} user=${process.env.POSTGRES_USER} dbname=${process.env.POSTGRES_DB} password=${await getDBPassword()} ${process.env.POSTGRES_PASSWORD ? '' : sslOpts} schemas=${process.env.POSTGRES_SCHEMA}`.replace(
          /\n/g,
          ' ',
        );

      log.info('Starting ogr2ogr', {
        source: mainFilePath,
        opts: JSON.stringify(ogr2ogrOpts),
      });

      await requestData.entityManager.query(`DROP TABLE IF EXISTS "${tableName}"`);

      try {
        await GdalCLI.ogr2ogr([...ogr2ogrOpts, pgDataset, tempVrtPath ?? mainFilePath]);
      } catch (translateError) {
        const errMsg = getErrorMessage(translateError);
        log.error('ogr2ogr failed', {
          source: mainFilePath,
          target: pgDataset.replace(/password=\S+/, 'password=***'),
          opts: JSON.stringify(ogr2ogrOpts),
          error: errMsg,
        });
        if (/ogr2ogr failed \(exit \d+\)/.test(errMsg)) {
          throw new JobError('FTD_GDAL_PARSE_ERROR', {}, errMsg);
        }
        throw translateError;
      }

      const depthRangeField: string | null = mapping
        ? (Object.keys(mapping).find(key => mapping[key] === DetectableFields.DEPTH) ?? null)
        : null;
      if (depthRangeField) {
        const nrows = await this.getValidDepthRangeCount(requestData.entityManager, tableName, depthRangeField);
        if (nrows === 0) {
          throw new JobError('FTD_INVALID_DEPTH_RANGE');
        }
      }

      await repo.update(fileEntity.id, { status: IngestionStatus.STAGED });
    } catch (error) {
      await repo.update(fileEntity.id, { status: IngestionStatus.PENDING });
      if (JobError.isJobError(error)) {
        throw error;
      }
      if (error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to load file to table: ${getErrorMessage(error)}`, StatusCodes.BAD_REQUEST);
    } finally {
      if (tempZipExtractPath) {
        FileService.removeTempFolder(tempZipExtractPath);
      }
      if (tempVrtPath) {
        FileService.removeTempFolder(tempVrtPath);
      }
    }
  };

  private async extractGeomFieldsFromMapping(
    mapping: DataMappingObject | undefined,
  ): Promise<{ geomField: string | null; latField: string | null; lonField: string | null }> {
    if (!mapping) return { geomField: null, latField: null, lonField: null };
    let geomField: string | null = null;
    let latField: string | null = null;
    let lonField: string | null = null;
    for (const [key, value] of Object.entries(mapping)) {
      if (value === DetectableFields.GEOMETRY) geomField = key;
      else if (value === DetectableFields.LATITUDE) latField = key;
      else if (value === DetectableFields.LONGITUDE) lonField = key;
    }
    return { geomField, latField, lonField };
  }

  private async getValidDepthRangeCount(entityManager: EntityManager, tableName: string, depthCol: string): Promise<number> {
    const query = entityManager
      .createQueryBuilder()
      .from(tableName, 'raw')
      .select('COUNT(*)', 'count')
      .where(`(raw.${depthCol} IS NOT NULL AND array_length(string_to_array(raw.${depthCol}::text, '-'), 1) = 2)`);
    const result = await entityManager.query(...query.getQueryAndParameters());
    return parseInt(result[0].count, 10);
  }
}
