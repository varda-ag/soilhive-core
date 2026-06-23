import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import FileService from '../../src/services/FileService';
import { GdalCLI } from '../../src/utils/GdalCLI';
import { ErrorResponse } from '../../src/utils/error';
import { StatusCodes } from 'http-status-codes';
import FileEntity from '../../src/entities/File';
import { FileMetadata } from '../../src/interfaces/File';

jest.mock('../../src/utils/db-credentials', () => ({
  getDBPassword: jest.fn().mockResolvedValue('test-password'),
}));

const BASE_METADATA: FileMetadata = {
  layer_name: 'test_layer',
  field_names: ['col1', 'col2'],
  detected_fields: {} as any,
  detected_mapping: {} as any,
  geometry_detected: true,
  geom_column: 'geometry',
  driver: 'GPKG',
};

const makeFileEntity = (metaOverrides: Partial<FileMetadata> = {}): FileEntity =>
  ({
    id: 'file-id',
    slug: 'file-slug',
    file_path: 'test/path.gpkg',
    metadata: { ...BASE_METADATA, ...metaOverrides },
  }) as FileEntity;

const makeEntityManager = () =>
  ({
    getRepository: jest.fn().mockReturnValue({
      update: jest.fn().mockResolvedValue({}),
    }),
    query: jest.fn().mockResolvedValue([]),
  }) as any;

describe('FileService.fileToDB — JobError surfacing', () => {
  let fileService: FileService;

  beforeEach(() => {
    fileService = new FileService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('E04 — FTD_MISSING_LAYER_NAME when layer_name is absent from metadata', async () => {
    jest.spyOn(fileService, 'getFile').mockResolvedValue(makeFileEntity({ layer_name: undefined }));

    await expect(fileService.fileToDB({ entityManager: makeEntityManager(), entitlements: {} }, 'file-id')).rejects.toMatchObject({
      name: 'JobError',
      code: 'FTD_MISSING_LAYER_NAME',
    });
  });

  it('E03 — FTD_NO_DATA_COLUMNS when field_names is empty', async () => {
    jest.spyOn(fileService, 'getFile').mockResolvedValue(makeFileEntity({ field_names: [] }));
    jest.spyOn(fileService as any, 'extractGeomFieldsFromMapping').mockResolvedValue({
      geomField: null,
      latField: null,
      lonField: null,
    });

    await expect(fileService.fileToDB({ entityManager: makeEntityManager(), entitlements: {} }, 'file-id')).rejects.toMatchObject({
      name: 'JobError',
      code: 'FTD_NO_DATA_COLUMNS',
    });
  });

  it('E01 — FTD_FILE_NOT_FOUND when storage returns 404', async () => {
    jest.spyOn(fileService, 'getFile').mockResolvedValue(makeFileEntity());
    jest.spyOn(fileService as any, 'extractGeomFieldsFromMapping').mockResolvedValue({
      geomField: null,
      latField: null,
      lonField: null,
    });
    jest.spyOn(FileService, 'getMainFilePath').mockRejectedValue(new ErrorResponse('Not found', StatusCodes.NOT_FOUND));

    await expect(fileService.fileToDB({ entityManager: makeEntityManager(), entitlements: {} }, 'file-id')).rejects.toMatchObject({
      name: 'JobError',
      code: 'FTD_FILE_NOT_FOUND',
    });
  });

  it('E02 — FTD_GDAL_PARSE_ERROR when ogr2ogr exits with non-zero code', async () => {
    jest.spyOn(fileService, 'getFile').mockResolvedValue(makeFileEntity());
    jest.spyOn(fileService as any, 'extractGeomFieldsFromMapping').mockResolvedValue({
      geomField: null,
      latField: null,
      lonField: null,
    });
    jest.spyOn(FileService, 'getMainFilePath').mockResolvedValue({
      mainFilePath: '/tmp/test.gpkg',
      tempZipExtractPath: null,
    });
    jest.spyOn(GdalCLI, 'ogr2ogr').mockRejectedValue(new Error('ogr2ogr failed (exit 1): unsupported file format'));

    await expect(fileService.fileToDB({ entityManager: makeEntityManager(), entitlements: {} }, 'file-id')).rejects.toMatchObject({
      name: 'JobError',
      code: 'FTD_GDAL_PARSE_ERROR',
    });
  });
});
