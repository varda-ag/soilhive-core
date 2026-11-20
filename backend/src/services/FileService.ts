import { StatusCodes } from 'http-status-codes';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { extractZip } from '../utils/zip';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileStorage } from '@flystorage/file-storage';
import { AwsS3StorageAdapter } from '@flystorage/aws-s3';
import { LocalStorageAdapter } from '@flystorage/local-fs';
import { FlystorageMulterStorageEngine } from '@flystorage/multer-storage';
import { GdalCLI, OgrInfoLayer, GdalInfoOutput, GdalInfoBand } from '../utils/GdalCLI';
import { SHAPE_SAMPLE_ROWS, ShapeSuggestion, suggestShape } from '../utils/vectorShape';
import { LocalStorageConfig, S3StorageConfig, StorageConfig } from '../interfaces/StorageConfig';
import { RequestData } from '../interfaces/RequestData';
import { File, FileMetadata, RasterBandMetadata, ExtractedFilePath, VectorFileMetadata } from '../interfaces/File';
import { LongFormatStats } from '../interfaces/CleaningReport';
import type { LongStageGeometry } from '../interfaces/Job';
import { georeferenceToWgs84, rasterGeoreference, vectorGeoreference } from '../utils/georeference';
import { categoryLabels } from '../utils/raster';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { getSubject } from '../utils/auth';
import { getEntity } from '../utils/slugs';
import { sanitizeField, buildDatedFileKey, getRawTableName, getLongTableName } from '../utils/utils';
import { JobQueues, StorageModes } from '../types/enums';
import { EntityType, IngestionStatus, ProcedureField, ProcedureTechnique } from '../types/data';
import {
  DataMappingObject,
  DetectableFields,
  LongFormatMapping,
  LongRoleColumns,
  MAX_MEASUREMENT_TYPES,
  MeasurementTypeMapping,
} from '../types/DataMapping';
import { PropertyMapping } from '../interfaces/PropertyMapping';
import { buildLongPivot, withLongWorkMem } from '../data-layer/LongPivot';
import { buildMeasurementTypesQuery } from '../data-layer/LongMeasurementTypes';
import { hasActiveFileJob } from '../data-layer/DatasetJobs';
import { isLongMapping, longFormatProblem } from '../utils/longFormat';
import { FoundMeasurementType, SuggestionSources, suggestMeasurementType } from '../utils/measurementTypes';
import { MappingSlugs, loadMappingSlugs, withCurrentSlugs } from '../data-layer/MappingSlugs';
import ConfigService from './ConfigService';
import FileEntity from '../entities/File';
import { JsonStorage } from '../entities/JsonStorage';
import assert from 'assert';
import { JobError } from '../errors/JobError';
import { translateJobError } from '../errors/jobErrorMessages';
import { getDBPassword } from '../utils/db-credentials';
import { log } from '../utils/logger';
import { bumpCacheEpoch } from '../utils/cache-epoch';
import { CACHE_TTL_REFERENCE_MS } from '../utils/query-cache';
import DataMappingService from './DataMappingService';
import DatasetFileMappingEntity from '../entities/DatasetFileMapping';
import SoilPropertyEntity from '../entities/SoilProperty';
import UnitConversionEntity from '../entities/UnitConversion';
import VocabularyEntity from '../entities/Vocabulary';
import RasterFilterEntity from '../entities/RasterFilter';
import { EntityManager, Repository } from 'node_modules/typeorm';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

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

/** An entry of a column mapping that names a property, as opposed to a metadata role such as 'min_depth'. */
const isMappingEntry = (entry: unknown): entry is PropertyMapping => entry !== null && typeof entry === 'object' && !Array.isArray(entry);

// One client signs every presigned URL, so its credentials are fetched once, not per URL: with web
// identity credentials (EKS) each new client called STS first. Rebuilt when the S3 config changes.
let presignClient: { config: string; client: S3Client } | undefined;

const getPresignClient = (s3Config: S3StorageConfig): S3Client => {
  const config = JSON.stringify([s3Config.region, s3Config.endpoint, s3Config.credentials]);
  if (presignClient?.config !== config) {
    presignClient = {
      config,
      client: new S3Client({
        region: s3Config.region,
        ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
        ...(s3Config.credentials ? { credentials: s3Config.credentials } : {}),
      }),
    };
  }
  return presignClient.client;
};

export default class FileService {
  exists = async (fileKey: string): Promise<boolean> => {
    const storage = FileService.getStorageEngine();
    return await storage.fileExists(fileKey);
  };

  deleteFileFromStorage = async (fileKey: string): Promise<void> => {
    const storage = FileService.getStorageEngine();
    await storage.deleteFile(fileKey);
  };

  static streamToBuffer = async (stream: Readable): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };

  /**
   * Resolves the custom frontend logo to a Buffer, regardless of where it lives.
   * DB-backed logos (see ADR 0015) carry base64 bytes in the jsonstorage row; legacy
   * logos have only a fileKey and are streamed from storage. Returns null when no logo is set.
   */
  static getLogo = async (repo: Repository<JsonStorage>): Promise<{ buffer: Buffer; fileKey: string } | null> => {
    const logo = await new ConfigService().getLogoData(repo);
    if (!logo?.fileKey) {
      return null;
    }
    if (logo.bytes) {
      return { buffer: Buffer.from(logo.bytes, 'base64'), fileKey: logo.fileKey };
    }
    const storage = FileService.getStorageEngine();
    const stream = await storage.read(logo.fileKey);
    const buffer = await FileService.streamToBuffer(stream as Readable);
    return { buffer, fileKey: logo.fileKey };
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
          uploadConfiguration: {
            partSize: s3Config.uploadPartSizeBytes,
            queueSize: s3Config.uploadQueueSize,
          },
        });
        break;
      }
      default:
        throw new Error(`Unsupported storage mode: ${config.storageMode}`);
    }
    return adapter;
  };

  getFile = async (requestData: RequestData, slug: string): Promise<FileEntity> => {
    return await getEntity(requestData, FileEntity, EntityType.FILE, slug);
  };

  /**
   * A File a Run may take Aggregation Units from: one no Dataset maps. A mapped File holds a
   * Dataset's data, so it is answered as unknown (docs/adr/0072).
   */
  getUnmappedFile = async (requestData: RequestData, slug: string): Promise<FileEntity> => {
    const file = await this.getFile(requestData, slug);
    const mappings = requestData.entityManager.getRepository(DatasetFileMappingEntity);
    if (await mappings.exists({ where: { file_id: file.id }, withDeleted: true })) {
      throw new ErrorResponse(`Resource '${slug}' not found`, StatusCodes.NOT_FOUND);
    }
    return file;
  };

  /**
   * Creates a File row for an already-uploaded blob.
   *
   * `spatial: false` uploads a non-spatial File: GDAL is never invoked, so `metadata` stays NULL
   * and the file has no CRS and no ingestion path (fileToDB requires metadata). Because nothing
   * probes the bytes, nothing can reject them either — non-spatial uploads are stored as-is.
   */
  createFile = async (requestData: RequestData, data: Partial<File>, spatial: boolean = true): Promise<FileEntity> => {
    const repo = requestData.entityManager.getRepository(FileEntity);
    const subject = getSubject(requestData);

    assert(data.file_path, 'file_path is required to create a file');
    const metadata = spatial ? await this.extractMetadata(requestData, data.file_path) : undefined;

    const file = repo.create({
      ...data,
      // Omit the column entirely for non-spatial files so it is stored as NULL.
      ...(metadata && { metadata }),
      status: IngestionStatus.PENDING,
      created_by: subject,
      updated_by: subject,
    });

    try {
      // A transaction of its own: POST /files runs without the request transaction (see transactionMiddleware)
      return await requestData.entityManager.transaction(async em => {
        const saved = await em.save(file);
        const reloaded = await em.findOneBy(FileEntity, { id: saved.id });
        return reloaded!;
      });
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

  /** The metadata with `epsg` as a Supplied CRS, and the Georeference placed again under it. */
  static withSuppliedCrs = async (metadata: FileMetadata | undefined, epsg: number): Promise<FileMetadata> => {
    const updated = { ...metadata, epsg, crs_source: 'supplied' } as FileMetadata;
    delete updated.georeference_wgs84;
    const georeference_wgs84 = updated.georeference ? await georeferenceToWgs84(updated.georeference, `EPSG:${epsg}`) : undefined;
    return { ...updated, ...(georeference_wgs84 && { georeference_wgs84 }) };
  };

  deleteFile = async (requestData: RequestData, slug: string): Promise<void> => {
    const file = await getEntity(requestData, FileEntity, EntityType.FILE, slug);
    // The install deletes it once done, and a failed one keeps it for a retry (docs/adr/0066)
    const rasterFilter = await requestData.entityManager.getRepository(RasterFilterEntity).findOneBy({ file_id: file.id });
    if (rasterFilter) {
      throw new ErrorResponse(
        `File '${slug}' is the source of raster filter '${rasterFilter.id}': delete the raster filter instead`,
        StatusCodes.CONFLICT,
      );
    }
    await requestData.entityManager.getRepository(FileEntity).softRemove(file);
    // Raster filter queries join on files (f.deleted_at IS NULL); see docs/adr/0008.
    await bumpCacheEpoch();
  };

  /**
   * Extracts ZIP file to a temporary directory and finds the main data file.
   * Looks for common geospatial file extensions.
   */
  private static extractZipAndFindMainFile = async (zipPath: string): Promise<{ tempZipExtractPath: string; mainFilePath: string }> => {
    const tempZipExtractPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gdal-zip-tmp'));

    try {
      // Extract ZIP to temporary directory
      await extractZip(zipPath, { dir: tempZipExtractPath });

      const files = fs.readdirSync(tempZipExtractPath);
      if (files.length === 1) {
        // Only one file, return it
        const mainFilePath = path.join(tempZipExtractPath, files[0]!);
        return { tempZipExtractPath, mainFilePath };
      }

      // Priority order: the first extension with a match wins
      const extensions = ['.shp', '.gpkg', '.geojson', '.gml', '.kml', '.kmz', '.gdb', '.csv', '.xlsx'];

      for (const ext of extensions) {
        for (const file of files) {
          if (file.toLowerCase().endsWith(ext)) {
            const mainFilePath = path.join(tempZipExtractPath, file);
            return { tempZipExtractPath, mainFilePath };
          }
        }
      }

      throw new ErrorResponse(
        `No recognized geospatial file found in ZIP archive (expected one of: ${extensions.join(', ')})`,
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

  /**
   * Pulls a ZIP out of S3 and applies same local storage logic.
   * The download lands in its own temp directory, separate from the one the archive is unpacked into.
   * The caller is responsible for removing it, as with local storage.
   */
  private static downloadAndExtractZip = async (fileKey: string): Promise<{ tempZipExtractPath: string; mainFilePath: string }> => {
    const storage = FileService.getStorageEngine();
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdal-zip-src-'));
    const localZipPath = path.join(downloadDir, path.basename(fileKey));

    try {
      // Piping to avoid OOM
      const stream = await storage.read(fileKey);
      await pipeline(stream as Readable, fs.createWriteStream(localZipPath));
      return await this.extractZipAndFindMainFile(localZipPath);
    } finally {
      await this.removeTempFolder(downloadDir);
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
        if (fileKey.toLowerCase().endsWith('.zip')) {
          // A ZIP is pulled down and unpacked, so the archive resolves through
          // extractZipAndFindMainFile exactly as it does on local storage.
          //
          // Use of /vsizip/vsis3/... avoids the download, but hands GDAL
          // the archive *root* and lets it choose: it auto-detects a Shapefile or .gdb and
          // fails on anything else, so a zipped CSV, GML or KMZ was rejected on S3.
          ({ tempZipExtractPath, mainFilePath } = await this.downloadAndExtractZip(fileKey));
        } else {
          const s3Config = config.config as S3StorageConfig;
          const key = s3Config.rootFolder ? `${s3Config.rootFolder}/${fileKey}` : fileKey;
          mainFilePath = `/vsis3/${s3Config.bucketName}/${key}`;
        }
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
    const s3Client = getPresignClient(s3Config);
    // A presigned URL stops working when the credentials that signed it expire, and the shared client
    // only renews them 5 minutes before that: renew them now if they would not outlive the URL.
    const { expiration } = await s3Client.config.credentials();
    if (expiration && expiration.getTime() - Date.now() < expiresIn * 1000) {
      await s3Client.config.credentials({ forceRefresh: true });
    }
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

  /**
   * For each column, the entry earlier mappings gave a column of that name, the one with the most
   * keys winning. With `slugs`, each entry names what it names by its current slug, and one whose
   * property is gone is passed over.
   */
  getDetectedMapping(fieldNames: string[], mappings: DataMappingObject[], slugs?: MappingSlugs): DataMappingObject {
    const output: DataMappingObject = {};

    for (const fieldName of fieldNames) {
      for (const mapping of mappings) {
        let current = mapping[fieldName];
        if (!current) {
          continue;
        }
        if (slugs && isMappingEntry(current)) {
          const resolved = withCurrentSlugs(current, slugs);
          if (!resolved) continue;
          current = resolved;
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
      const ext = path.extname(mainFilePath).toLowerCase();
      const isExcel = ['.xlsx', '.xls'].includes(ext);
      const { driver, layers } =
        ext === '.csv'
          ? await GdalCLI.ogrinfoCsv(mainFilePath)
          : await GdalCLI.ogrinfo(mainFilePath, isExcel ? ['GEOM_POSSIBLE_NAMES=*', 'HEADERS=FORCE'] : ['GEOM_POSSIBLE_NAMES=*']);

      log.info('Getting data layer and detecting geometry', { source: mainFilePath, driver });
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
      // The entries this file's columns could take, for the current slugs of what they name
      const candidates = mappings.flatMap(mapping => fieldNames.map(field => mapping[field]).filter(isMappingEntry));
      const slugs = await loadMappingSlugs(requestData.entityManager, candidates);
      const detected_mapping: DataMappingObject = this.getDetectedMapping(fieldNames, mappings, slugs);

      const georeference = vectorGeoreference(layer);
      const georeference_wgs84 = georeference && layer.epsg ? await georeferenceToWgs84(georeference, `EPSG:${layer.epsg}`) : undefined;

      const detected_fields: Record<DetectableFields, string | null> = {
        [DetectableFields.GEOMETRY]: geometryFieldName,
        [DetectableFields.LICENSE]: licenseFieldName,
        [DetectableFields.SAMPLING_DATE]: samplingDateFieldName,
        [DetectableFields.DEPTH]: depthFieldName,
        [DetectableFields.MIN_DEPTH]: minDepthFieldName,
        [DetectableFields.MAX_DEPTH]: maxDepthFieldName,
        [DetectableFields.HORIZON]: horizonFieldName,
        [DetectableFields.LATITUDE]: latitudeFieldName,
        [DetectableFields.LONGITUDE]: longitudeFieldName,
      };
      const shape = await this.suggestShape(requestData, mainFilePath, layer, detected_fields, isExcel ? ['HEADERS=FORCE'] : []);

      const metadata: FileMetadata = {
        is_raster: false,
        field_names: fieldNames,
        detected_mapping,
        detected_fields,
        detected_format: shape.format,
        ...(shape.roles && { detected_long_roles: shape.roles }),
        geometry_detected: geometryDetected,
        driver,
        layer_name: layer.name,
        ...(layer.geomColumn && { geom_column: layer.geomColumn }),
        ...(layer.epsg && { epsg: layer.epsg, crs_source: 'inferred' as const }),
        georeference,
        ...(georeference_wgs84 && { georeference_wgs84 }),
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

  /**
   * The suggested shape of a vector File, from its first rows (docs/adr/0081). It is a suggestion
   * the user can overrule, so a sample that cannot be read leaves the File wide instead of
   * failing the upload.
   */
  private async suggestShape(
    requestData: RequestData,
    mainFilePath: string,
    layer: OgrInfoLayer,
    detectedFields: Record<DetectableFields, string | null>,
    openOptions: string[],
  ): Promise<ShapeSuggestion> {
    try {
      const features = await GdalCLI.sampleFeatures(mainFilePath, layer.name, SHAPE_SAMPLE_ROWS, openOptions);

      const em = requestData.entityManager;
      const [procedure, conversions, properties] = await Promise.all([
        FileService.procedureLists(em),
        em.getRepository(UnitConversionEntity).find({ select: { original_unit_of_measurement: true }, cache: CACHE_TTL_REFERENCE_MS }),
        em.getRepository(SoilPropertyEntity).find({ select: { standard_unit: true }, cache: CACHE_TTL_REFERENCE_MS }),
      ]);
      const units = [...conversions.map(c => c.original_unit_of_measurement), ...properties.map(p => p.standard_unit)].filter(
        (u): u is string => !!u,
      );

      return suggestShape(
        layer.fields.map(f => f.name),
        features,
        detectedFields,
        { units, procedure },
      );
    } catch (error) {
      log.warn('Failed to suggest the shape of a vector file', { source: mainFilePath, error: getErrorMessage(error) });
      return { format: 'wide' };
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
        ...(band.overviews !== undefined && { overviews: band.overviews.map(ov => ov.size) }),
        ...withCategoryLabels(band, gdalInfo),
      }));

      const wkt = gdalInfo.coordinateSystem?.wkt;
      const epsg = GdalCLI.extractEpsgFromWkt(wkt);
      const georeference = rasterGeoreference(gdalInfo);
      const georeference_wgs84 = georeference && wkt ? await georeferenceToWgs84(georeference, wkt) : undefined;
      const size: [number, number] = gdalInfo.size ?? [0, 0];

      const metadata: FileMetadata = {
        is_raster: true,
        size,
        band_count: raster_bands.length,
        raster_bands,
        ...(gdalInfo.driverShortName && { driver: gdalInfo.driverShortName }),
        ...(epsg !== undefined && { epsg }),
        ...(wkt && { wkt, crs_source: 'inferred' as const }),
        georeference,
        ...(georeference_wgs84 && { georeference_wgs84 }),
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
    // Staging a loaded File again would re-ingest its records on the next Bulk Load
    if (fileEntity.status === IngestionStatus.LOADED) {
      throw new JobError('FTD_FILE_ALREADY_LOADED', { file_name: fileEntity.name });
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
    if (!mapping) {
      throw new JobError('FTD_MISSING_COLUMN_MAPPING', { file_name: fileEntity.name });
    }

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

    const originalGeomFields = [mappingGeomFields.geomField, mappingGeomFields.lonField, mappingGeomFields.latField].map(item =>
      item?.toLowerCase(),
    );
    const mappingNonGeomFields = Object.keys(mapping).filter(item => !originalGeomFields.includes(item.toLowerCase()));
    let selectClause = mappingNonGeomFields.map(field => `"${field}" AS ${sanitizeField(field)}`).join(', ');

    try {
      if (isLongMapping(mapping)) {
        const long_format_stats = await this.pivotLongFile(requestData, fileEntity, mapping);
        // Read by the preview stats; the long table may be gone by then
        await repo.update(fileEntity.id, { status: IngestionStatus.STAGED, metadata: { ...fileMetadata, long_format_stats } });
        return;
      }
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

      const source = FileService.geometrySource(fileMetadata, mappingGeomFields, mainFilePath, layerName, true);
      tempVrtPath = source.tempVrtPath;
      ogr2ogrOpts.push(...source.opts);
      if (source.geometrySelect) {
        selectClause = `${selectClause}, ${source.geometrySelect}`;
      }

      ogr2ogrOpts.push('-sql', `SELECT ${selectClause} FROM "${layerName}"`);

      await requestData.entityManager.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await FileService.runOgr2ogr(ogr2ogrOpts, tempVrtPath ?? mainFilePath, 'FTD_GDAL_PARSE_ERROR');

      const depthRangeField: string | null = mapping
        ? (Object.keys(mapping).find(key => mapping[key] === DetectableFields.DEPTH) ?? null)
        : null;
      if (depthRangeField) {
        const nrows = await this.getValidDepthRangeCount(requestData.entityManager, tableName, depthRangeField);
        if (nrows === 0) {
          throw new JobError('FTD_INVALID_DEPTH_RANGE');
        }
      }

      // A File switched from long to wide keeps neither its long table nor the counts of its pivot
      await requestData.entityManager.query(`DROP TABLE IF EXISTS "${getLongTableName(fileEntity.id)}"`);
      const { long_format_stats, ...wideMetadata } = fileMetadata;
      await repo.update(fileEntity.id, { status: IngestionStatus.STAGED, ...(long_format_stats && { metadata: wideMetadata }) });
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

  /**
   * Copies a long File into its long table as it is, for file-to-db to pivot (docs/adr/0081): every
   * column of the first layer, and the geometry as file-to-db reads it. Run again whenever the
   * geometry, latitude, longitude or CRS of the File changes. The File stays PENDING.
   */
  longStage = async (requestData: RequestData, fileId: string, geometry: LongStageGeometry = {}) => {
    const fileEntity = await this.getFile(requestData, fileId);
    assert(fileEntity.file_path, `File path not found for file ${fileId}`);
    assert(fileEntity.metadata, `Metadata not found for file ${fileId}`);
    const fileMetadata = fileEntity.metadata;
    if (fileMetadata.is_raster) {
      throw new JobError('FTD_RASTER_NOT_SUPPORTED');
    }
    if (!fileMetadata.layer_name) {
      throw new JobError('FTD_MISSING_LAYER_NAME');
    }
    // Its long table went with the Bulk Load, and so did the need for one
    if (fileEntity.status === IngestionStatus.LOADED) {
      throw new JobError('LS_FILE_ALREADY_LOADED', { file_name: fileEntity.name });
    }
    const layerName = fileMetadata.layer_name;

    for (const column of [geometry.geom_col, geometry.lat_col, geometry.lon_col]) {
      if (column && !fileMetadata.field_names.includes(column)) {
        throw new JobError('LS_COLUMN_NOT_FOUND', { column, file_name: fileEntity.name });
      }
    }
    // The columns the job names come first: the user set them on a mapping not saved yet. Then the
    // saved mapping, and with neither, the geometry is read as it was detected
    let mappingGeomFields: { geomField: string | null; latField: string | null; lonField: string | null };
    if (geometry.geom_col || geometry.lat_col) {
      mappingGeomFields = { geomField: geometry.geom_col ?? null, latField: geometry.lat_col ?? null, lonField: geometry.lon_col ?? null };
    } else {
      const datasetFileMapping = await requestData.entityManager.getRepository(DatasetFileMappingEntity).findOne({
        where: { file_id: fileEntity.id },
        relations: ['data_mapping'],
      });
      mappingGeomFields = await this.extractGeomFieldsFromMapping(datasetFileMapping?.data_mapping?.data_mapping);
    }
    const detected = fileMetadata.detected_fields;
    const geometryFound =
      fileMetadata.geometry_detected ||
      mappingGeomFields.geomField ||
      (mappingGeomFields.latField && mappingGeomFields.lonField) ||
      detected[DetectableFields.GEOMETRY] ||
      (detected[DetectableFields.LATITUDE] && detected[DetectableFields.LONGITUDE]);
    if (!geometryFound) {
      throw new JobError('LS_GEOMETRY_NOT_FOUND', { file_name: fileEntity.name });
    }

    let tempZipExtractPath: string | null = null;
    let tempVrtPath: string | null = null;
    const tableName = getLongTableName(fileEntity.id);
    const ogr2ogrOpts: string[] = [
      '-f',
      'PostgreSQL',
      '-explodecollections',
      '-lco',
      'FID=source_id',
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

    try {
      let mainFilePath: string;
      try {
        ({ mainFilePath, tempZipExtractPath } = await FileService.getMainFilePath(fileEntity.file_path));
      } catch (err) {
        if (err instanceof ErrorResponse && err.status === StatusCodes.NOT_FOUND) {
          throw new JobError('FTD_FILE_NOT_FOUND');
        }
        throw err;
      }

      // Column types are not detected: a CSV column stays text, so a local code such as 007 is kept
      const source = FileService.geometrySource(fileMetadata, mappingGeomFields, mainFilePath, layerName, false);
      tempVrtPath = source.tempVrtPath;
      ogr2ogrOpts.push(...source.opts);

      // The columns the table names itself, and the one read as geometry
      const taken = ['geometry', 'source_id', source.geometryColumn?.toLowerCase()];
      const fields = fileMetadata.field_names.filter(field => !taken.includes(field.toLowerCase()));
      if (fields.length === 0) {
        throw new JobError('FTD_NO_DATA_COLUMNS');
      }
      const selectClause = [...fields.map(field => `"${field}"`), ...(source.geometrySelect ? [source.geometrySelect] : [])].join(', ');
      ogr2ogrOpts.push('-sql', `SELECT ${selectClause} FROM "${layerName}"`);

      await requestData.entityManager.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await FileService.runOgr2ogr(ogr2ogrOpts, tempVrtPath ?? mainFilePath, 'LS_GDAL_PARSE_ERROR');
    } catch (error) {
      if (JobError.isJobError(error) || error instanceof ErrorResponse) {
        throw error;
      }
      throw new ErrorResponse(`Failed to stage long file: ${getErrorMessage(error)}`, StatusCodes.BAD_REQUEST);
    } finally {
      if (tempZipExtractPath) {
        FileService.removeTempFolder(tempZipExtractPath);
      }
      if (tempVrtPath) {
        FileService.removeTempFolder(tempVrtPath);
      }
    }
  };

  /** The fixed list of each procedure field: the techniques, and the vocabulary of the others. */
  private static async procedureLists(em: EntityManager): Promise<Partial<Record<ProcedureField, string[]>>> {
    const vocabulary = await em
      .getRepository(VocabularyEntity)
      .find({ select: { category: true, name: true }, cache: CACHE_TTL_REFERENCE_MS });
    const lists: Partial<Record<ProcedureField, string[]>> = { technique: Object.values(ProcedureTechnique) };
    for (const { category, name } of vocabulary) {
      (lists[category] ??= []).push(name);
    }
    return lists;
  }

  /**
   * The Measurement Types of a staged long File for the given role columns, each with suggested
   * answers (docs/adr/0081). Reads the long table only, so it is asked again whenever a role changes.
   *
   * `fixedProperty` is the slug of the Soil Property of the whole File, for one with no property
   * column: units are then matched against that property's conversions.
   */
  getMeasurementTypes = async (
    requestData: RequestData,
    fileId: string,
    roles: LongRoleColumns,
    fixedProperty?: string,
  ): Promise<FoundMeasurementType[]> => {
    const em = requestData.entityManager;
    const file = await this.getFile(requestData, fileId);
    if (!file.metadata || file.metadata.is_raster) {
      throw new ErrorResponse(`File '${file.name}' is not a vector file`, StatusCodes.BAD_REQUEST);
    }
    // The long table is dropped and written again while long-stage runs
    if (await hasActiveFileJob(em, JobQueues.LONG_STAGE, file, true)) {
      throw new ErrorResponse(`File '${file.name}' is still being staged`, StatusCodes.CONFLICT);
    }
    const columns: { column_name: string }[] = await em.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [process.env.POSTGRES_SCHEMA, getLongTableName(file.id)],
    );
    if (columns.length === 0) {
      throw new ErrorResponse(`File '${file.name}' has not been staged as a long file`, StatusCodes.NOT_FOUND);
    }
    // One more than the limit, to tell a File at the limit from one over it
    const query = buildMeasurementTypesQuery(roles, file.id, MAX_MEASUREMENT_TYPES + 1);
    const missing = query.sourceColumns.find(column => !columns.some(c => c.column_name === column));
    if (missing) {
      throw new ErrorResponse(`Column '${missing}' is not a column of file '${file.name}'`, StatusCodes.BAD_REQUEST);
    }

    const rows: Record<string, string | number | null>[] = await withLongWorkMem(em, tx => tx.query(query.sql, query.values));
    if (rows.length > MAX_MEASUREMENT_TYPES) {
      const code = 'FTD_LONG_TOO_MANY_MEASUREMENT_TYPES';
      const { message, actions } = translateJobError(code, { file_name: file.name, max: MAX_MEASUREMENT_TYPES });
      throw new ErrorResponse(message, StatusCodes.UNPROCESSABLE_ENTITY, { code, actions });
    }

    // Earlier answers name entities by their slug when saved; a renamed one is suggested by its slug now
    const earlier = await dataMappingService.getLongFormats(requestData);
    const answers = (long: LongFormatMapping) => (Array.isArray(long?.measurement_types) ? long.measurement_types.filter(Boolean) : []);
    const slugs = await loadMappingSlugs(em, earlier.flatMap(answers));
    const longFormats = earlier.map(long => ({
      ...long,
      measurement_types: answers(long)
        .map(answer => withCurrentSlugs(answer, slugs))
        .filter((answer): answer is MeasurementTypeMapping => answer !== null),
    }));
    const hasProcedureCols = Object.keys(roles.procedure_cols ?? {}).length > 0;
    const [properties, conversions, vocabulary] = await Promise.all([
      em.getRepository(SoilPropertyEntity).find({
        select: { id: true, slug: true, property_name: true, property_acronym: true },
        cache: CACHE_TTL_REFERENCE_MS,
      }),
      em.getRepository(UnitConversionEntity).find({
        select: { slug: true, property_id: true, original_unit_of_measurement: true },
        cache: CACHE_TTL_REFERENCE_MS,
      }),
      // Only procedure values are matched against it
      hasProcedureCols ? FileService.procedureLists(em) : {},
    ]);
    const sources: SuggestionSources = {
      longFormats,
      properties,
      conversions,
      procedures: [...slugs.procedure.values()],
      vocabulary,
      ...(fixedProperty && { fixedProperty }),
    };

    return rows.map(row => {
      const match: FoundMeasurementType['match'] = {};
      query.keys.forEach((key, i) => {
        match[key] = row[`k${i}`] as string | null;
      });
      const suggestion = suggestMeasurementType(match, roles, sources);
      return {
        match,
        row_count: Number(row['row_count']),
        // numeric comes back as text
        min_value: row['min_value'] === null ? null : Number(row['min_value']),
        max_value: row['max_value'] === null ? null : Number(row['max_value']),
        non_numeric_count: Number(row['non_numeric_count']),
        ...(suggestion && { suggestion }),
      };
    });
  };

  /**
   * Builds the raw table of a long File from its long table, one column per mapped Measurement
   * Type (docs/adr/0081), in place of the ogr2ogr run of a wide File. Returns what it left out.
   */
  private async pivotLongFile(requestData: RequestData, file: FileEntity, mapping: DataMappingObject): Promise<LongFormatStats> {
    const long = mapping.long_format!;
    if (!long.value_col) {
      throw new JobError('FTD_LONG_NO_VALUE_COLUMN', { file_name: file.name });
    }
    if (!Array.isArray(long.measurement_types) || long.measurement_types.length === 0) {
      throw new JobError('FTD_LONG_NO_MEASUREMENT_TYPES', { file_name: file.name });
    }
    if (long.measurement_types.length > MAX_MEASUREMENT_TYPES) {
      throw new JobError('FTD_LONG_TOO_MANY_MEASUREMENT_TYPES', { file_name: file.name, max: MAX_MEASUREMENT_TYPES });
    }
    // A mapping is checked when it is saved; this one was stored some other way
    const problem = longFormatProblem(mapping);
    if (problem) {
      throw new ErrorResponse(problem, StatusCodes.BAD_REQUEST);
    }
    // The long table is dropped and written again while long-stage runs
    if (await hasActiveFileJob(requestData.entityManager, JobQueues.LONG_STAGE, file)) {
      throw new JobError('FTD_LONG_STAGING_RUNNING', { file_name: file.name });
    }

    const em = requestData.entityManager;
    const columns: { column_name: string }[] = await em.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [process.env.POSTGRES_SCHEMA, getLongTableName(file.id)],
    );
    if (columns.length === 0) {
      throw new JobError('FTD_LONG_TABLE_NOT_FOUND', { file_name: file.name });
    }
    const pivot = buildLongPivot(mapping, file.id);
    const missing = pivot.sourceColumns.find(column => !columns.some(c => c.column_name === column));
    if (missing) {
      throw new JobError('FTD_LONG_COLUMN_NOT_FOUND', { file_name: file.name, column: missing });
    }

    const tableName = getRawTableName(file.id);
    await em.query(`DROP TABLE IF EXISTS "${tableName}"`);
    await em.query(pivot.createSql);
    try {
      await withLongWorkMem(em, tx => tx.query(pivot.insertSql, pivot.values));
    } catch (error) {
      await em.query(`DROP TABLE IF EXISTS "${tableName}"`);
      throw error;
    }

    const depthRangeField = Object.keys(mapping).find(key => mapping[key] === DetectableFields.DEPTH);
    if (depthRangeField) {
      const nrows = await this.getValidDepthRangeCount(em, tableName, sanitizeField(depthRangeField));
      if (nrows === 0) {
        throw new JobError('FTD_INVALID_DEPTH_RANGE');
      }
    }

    const [stats]: LongFormatStats[] = await withLongWorkMem(em, tx => tx.query(pivot.statsSql, pivot.values));
    return stats!;
  }

  /**
   * How ogr2ogr reads the geometry and CRS of a File into a table: its options, the geometry
   * expression for the select (null where OGR passes the geometry through by itself), the source
   * column read as geometry, and the VRT written for it, which the caller removes.
   *
   * `autodetectTypes` has a CSV's column types detected, as a wide File needs; without it they stay text.
   */
  private static geometrySource(
    fileMetadata: VectorFileMetadata,
    mappingGeomFields: { geomField: string | null; latField: string | null; lonField: string | null },
    mainFilePath: string,
    layerName: string,
    autodetectTypes: boolean,
  ): { opts: string[]; geometrySelect: string | null; geometryColumn: string | null; tempVrtPath: string | null } {
    const opts: string[] = [];
    let geometrySelect: string | null = null;
    let geometryColumn: string | null = null;
    let tempVrtPath: string | null = null;
    let keepGeomColumn = 'YES';

    if (!fileMetadata.geometry_detected) {
      if (mappingGeomFields.geomField) {
        // GEOM_POSSIBLE_NAMES is a no-op for some drivers (e.g. XLSX warns "does not support
        // open option" and ignores it), so the column still arrives as a plain string. CAST ...
        // AS GEOMETRY parses it from WKT/WKB/GeoJSON regardless of whether the driver-level
        // option took effect — without it, the column round-trips as text.
        opts.push('-oo', `GEOM_POSSIBLE_NAMES=${mappingGeomFields.geomField}`);
        geometrySelect = `CAST("${mappingGeomFields.geomField}" AS GEOMETRY) AS geometry`;
        geometryColumn = mappingGeomFields.geomField;
        keepGeomColumn = 'NO';
      } else if (mappingGeomFields.latField && mappingGeomFields.lonField) {
        if (fileMetadata.driver === 'XLSX') {
          tempVrtPath = FileService.createPointVrt(mainFilePath, layerName, mappingGeomFields.lonField, mappingGeomFields.latField);
        } else {
          opts.push('-oo', `X_POSSIBLE_NAMES=${mappingGeomFields.lonField}`, '-oo', `Y_POSSIBLE_NAMES=${mappingGeomFields.latField}`);
          geometrySelect = `"_ogr_geometry_" AS geometry`;
        }
      } else if (fileMetadata.detected_fields[DetectableFields.GEOMETRY]) {
        opts.push('-oo', `GEOM_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.GEOMETRY]}`);
        geometrySelect = `CAST("${fileMetadata.detected_fields[DetectableFields.GEOMETRY]}" AS GEOMETRY) AS geometry`;
        geometryColumn = fileMetadata.detected_fields[DetectableFields.GEOMETRY];
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
          opts.push(
            '-oo',
            `X_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.LONGITUDE]}`,
            '-oo',
            `Y_POSSIBLE_NAMES=${fileMetadata.detected_fields[DetectableFields.LATITUDE]}`,
          );
          geometrySelect = `"_ogr_geometry_" AS geometry`;
        }
      } else {
        throw new ErrorResponse('Geometry not found: no geometry column in user mapping or auto-detected fields', StatusCodes.BAD_REQUEST);
      }
    }

    if (fileMetadata.driver === 'XLSX') {
      opts.push('-oo', 'HEADERS=FORCE');
    }

    if (fileMetadata.epsg && fileMetadata.epsg !== 4326) {
      // Reproject from the declared non-WGS84 source CRS to WGS84.
      opts.push('-s_srs', `EPSG:${fileMetadata.epsg}`);
      opts.push('-t_srs', 'EPSG:4326');
    } else {
      // Source is WGS84 or CRS unknown (assumed WGS84): assign SRID without reprojecting.
      // -a_srs avoids GDAL 3.10.x's PostgreSQL driver spurious coordinate shift that occurs
      // when -s_srs EPSG:4326 is combined with -t_srs EPSG:4326 on a null-SRS CSV layer.
      opts.push('-a_srs', 'EPSG:4326');
    }

    if (fileMetadata.geometry_detected && fileMetadata.geom_column) {
      geometryColumn = fileMetadata.geom_column;
      if (unknownGeomDrivers.includes(fileMetadata.driver ?? '')) {
        // CSV/XLSX: re-open with the sniffed column as geometry. A column literally
        // named "WKT" becomes an unnamed OGR geometry field that cannot be referenced
        // in SQL; OGR SQL passes the geometry through implicitly instead.
        opts.push('-oo', `GEOM_POSSIBLE_NAMES=${fileMetadata.geom_column}`);
        keepGeomColumn = 'NO';
      } else {
        // e.g. GPKG executes -sql natively (SQLite), where geometry must be selected explicitly.
        geometrySelect = `"${fileMetadata.geom_column}" as geometry`;
      }
    }

    if (unknownGeomDrivers.includes(fileMetadata.driver ?? '')) {
      if (autodetectTypes) {
        opts.push('-oo', 'AUTODETECT_TYPE=YES');
      }
      opts.push('-oo', 'EMPTY_STRING_AS_NULL=YES', '-oo', `KEEP_GEOM_COLUMNS=${keepGeomColumn}`);
    }

    return { opts, geometrySelect, geometryColumn, tempVrtPath };
  }

  /** Runs ogr2ogr into the database. A run GDAL itself fails is the JobError `parseErrorCode`. */
  private static async runOgr2ogr(ogr2ogrOpts: string[], source: string, parseErrorCode: string): Promise<void> {
    const bundleFile = path.join(__dirname, '..', 'assets', 'global-bundle.pem');
    const sslOpts = `sslmode=verify-full sslrootcert=${bundleFile}`;
    const pgDataset =
      `PG:host=${process.env.POSTGRES_HOST} port=${process.env.POSTGRES_PORT} user=${process.env.POSTGRES_USER} dbname=${process.env.POSTGRES_DB} password=${await getDBPassword()} ${process.env.POSTGRES_PASSWORD ? '' : sslOpts} schemas=${process.env.POSTGRES_SCHEMA}`.replace(
        /\n/g,
        ' ',
      );

    log.info('Starting ogr2ogr', {
      source,
      opts: JSON.stringify(ogr2ogrOpts),
    });

    try {
      await GdalCLI.ogr2ogr([...ogr2ogrOpts, pgDataset, source]);
    } catch (translateError) {
      const errMsg = getErrorMessage(translateError);
      log.error('ogr2ogr failed', {
        source,
        target: pgDataset.replace(/password=\S+/, 'password=***'),
        opts: JSON.stringify(ogr2ogrOpts),
        error: errMsg,
      });
      if (/ogr2ogr failed \(exit \d+\)/.test(errMsg)) {
        throw new JobError(parseErrorCode, {}, errMsg);
      }
      throw translateError;
    }
  }

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

// Shown on the upload so an admin can tell which band a Raster Filter's labels are in. The install
// reads them again itself, since the File it consumes may predate this.
const withCategoryLabels = (band: GdalInfoBand, info: GdalInfoOutput): { category_labels?: Record<string, string> } => {
  const labels = categoryLabels(band, info);
  return labels ? { category_labels: labels } : {};
};
