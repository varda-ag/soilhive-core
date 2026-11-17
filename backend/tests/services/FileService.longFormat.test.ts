import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { EntityManager } from 'typeorm';
import FileService from '../../src/services/FileService';
import DataMappingService from '../../src/services/DataMappingService';
import FileEntity from '../../src/entities/File';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { addCategory, addDataMapping, addSoilProperty, linkMapping } from '../../src/utils/mock';
import { getLongTableName, getRawTableName } from '../../src/utils/utils';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { IngestionStatus } from '../../src/types/data';
import { getTableColumns } from '../helper';
import { writableAssets } from '../assets';

const vectorFilesPassPath = writableAssets('vector_files/pass');

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

/**
 * `long_local_codes.csv` holds three points at one depth, each with four rows: P_OLSEN_2, pH_H2O,
 * OC_WB and XK_17, in that order. So the points start at source rows 1, 5 and 9.
 */
describe('FileService - long files', () => {
  let fileService: FileService;
  let entityManager: EntityManager;
  let requestData: RequestData;

  beforeAll(async () => {
    fileService = new FileService();
    entityManager = await getEntityManager();
  });

  beforeEach(() => {
    process.env.LOCAL_STORAGE_ROOT_FOLDER = vectorFilesPassPath;
    requestData = { entityManager, token: mockToken, entitlements: {} };
  });

  const rawRows = async (file: FileEntity): Promise<Record<string, unknown>[]> =>
    (await getDataSource()).query(
      `SELECT *, ST_AsText(geometry) AS wkt FROM "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(file.id)}" ORDER BY record_id`,
    );

  const createFile = (name: string) => fileService.createFile(requestData, { name, file_path: name });

  const localCodesMapping = (propertyId: string, codes: string[]) => ({
    top: 'min_depth',
    bottom: 'max_depth',
    long_format: {
      property_col: 'det',
      value_col: 'conc',
      measurement_types: codes.map((code, i) => ({ col: `s${i + 1}`, match: { property: code }, property_id: propertyId })),
    },
  });

  describe('longStage', () => {
    it('copies every column as text, with the geometry and the source row number', async () => {
      const file = await createFile('long_local_codes.csv');

      await fileService.longStage(requestData, file.slug);

      const columns = await getTableColumns(getLongTableName(file.id));
      expect(columns.map(c => c.column_name).sort()).toEqual(
        ['source_id', 'geometry', 'top', 'bottom', 'site_no', 'det', 'conc', 'um', 'lab'].sort(),
      );
      for (const name of ['top', 'site_no', 'conc']) {
        expect(columns.find(c => c.column_name === name)?.data_type).toBe('character varying');
      }
      const [{ count, located }] = await (
        await getDataSource()
      ).query(
        `SELECT COUNT(*)::int AS count, COUNT(geometry)::int AS located FROM "${process.env.POSTGRES_SCHEMA}"."${getLongTableName(file.id)}"`,
      );
      expect(count).toBe(12);
      expect(located).toBe(12);
      // The File is not staged yet: that is file-to-db's
      const reloaded = await entityManager.findOneByOrFail(FileEntity, { id: file.id });
      expect(reloaded.status).toBe(IngestionStatus.PENDING);
    });

    it('refuses a loaded file', async () => {
      const file = await createFile('long_local_codes.csv');
      await entityManager.update(FileEntity, file.id, { status: IngestionStatus.LOADED });

      await expect(fileService.longStage(requestData, file.slug)).rejects.toMatchObject({
        name: 'JobError',
        code: 'LS_FILE_ALREADY_LOADED',
      });
    });
  });

  describe('fileToDB with a long mapping', () => {
    it('pivots the mapped measurement types into one row per location and depth', async () => {
      const file = await createFile('long_local_codes.csv');
      const property = await addSoilProperty('P', (await addCategory()).id);
      await linkMapping(file, localCodesMapping(property.slug, ['P_OLSEN_2', 'pH_H2O']));
      await fileService.longStage(requestData, file.slug);

      await fileService.fileToDB(requestData, file.slug);

      const columns = await getTableColumns(getRawTableName(file.id));
      // OC_WB and XK_17 are not mapped, so they get no column
      expect(columns.map(c => c.column_name).sort()).toEqual(['record_id', 'geometry', 'top', 'bottom', 's1', 's2'].sort());
      const rows = await rawRows(file);
      expect(rows.map(r => [r.record_id, r.wkt, Number(r.top), Number(r.bottom), r.s1, r.s2])).toEqual([
        [1, 'POINT(12.8 42.4)', 0, 20, '14.2', '6.8'],
        [5, 'POINT(139.6917 35.6895)', 0, 20, '22.5', '5.9'],
        [9, 'POINT(36.8219 -1.2921)', 0, 20, '8.1', '6.2'],
      ]);
      const reloaded = await entityManager.findOneByOrFail(FileEntity, { id: file.id });
      expect(reloaded.status).toBe(IngestionStatus.STAGED);
    });

    it('keeps the record ids when other measurement types are mapped', async () => {
      const file = await createFile('long_local_codes.csv');
      const property = await addSoilProperty('P', (await addCategory()).id);
      // XK_17 is the last row of each point, yet its rows are numbered as the points are
      await linkMapping(file, localCodesMapping(property.slug, ['XK_17']));
      await fileService.longStage(requestData, file.slug);

      await fileService.fileToDB(requestData, file.slug);

      const rows = await rawRows(file);
      expect(rows.map(r => [r.record_id, r.s1])).toEqual([
        [1, '0.4'],
        [5, '0.7'],
        [9, '0.5'],
      ]);
    });

    it('puts a second value on an extra row and removes an exact repeat', async () => {
      const name = 'long_repeats.csv';
      fs.writeFileSync(
        path.join(vectorFilesPassPath, name),
        [
          'WKT,top,bottom,det,conc',
          'POINT (12.8 42.4),0,20,pH,6.8',
          'POINT (12.8 42.4),0,20,pH,6.8',
          'POINT (12.8 42.4),0,20,pH,7.0',
          'POINT (12.8 42.4),0,20,clay,30',
          'POINT (12.8 42.4),0,20,sand,',
          '',
        ].join('\n'),
      );
      const file = await createFile(name);
      const property = await addSoilProperty('P', (await addCategory()).id);
      await linkMapping(file, localCodesMapping(property.slug, ['pH', 'clay', 'sand']));
      await fileService.longStage(requestData, file.slug);

      await fileService.fileToDB(requestData, file.slug);

      const rows = await rawRows(file);
      // Row 3 holds the second pH of the group, so the extra row takes its number. An empty value fills no cell.
      expect(rows.map(r => [r.record_id, r.s1, r.s2, r.s3])).toEqual([
        [1, '6.8', '30', null],
        [3, '7.0', null, null],
      ]);
    });

    it('loads every measurement type under the fixed property of a file with no property column', async () => {
      const file = await createFile('long_no_property.csv');
      const property = await addSoilProperty('P', (await addCategory()).id);
      const mapping = {
        min_depth: 'min_depth',
        max_depth: 'max_depth',
        sampling_date: 'sampling_date',
        license: 'license',
        long_format: {
          fixed_property_id: property.slug,
          value_col: 'value',
          unit_col: 'unit',
          procedure_cols: { laboratory_method: 'laboratory_method' },
          measurement_types: [
            { col: 's1', match: { unit: 'mg/kg', laboratory_method: 'Olsen' } },
            { col: 's2', match: { unit: 'mg/kg', laboratory_method: 'Bray 1' }, min_val: 1 },
          ],
        },
      };
      await linkMapping(file, mapping);
      await fileService.longStage(requestData, file.slug);

      await fileService.fileToDB(requestData, file.slug);

      const rows = await rawRows(file);
      expect(rows.map(r => [r.record_id, r.s1, r.s2, r.sampling_date])).toEqual([
        [1, '14.2', null, '2021-05-03'],
        [2, '22.5', null, '2021-05-04'],
        [3, null, '8.1', '2021-05-05'],
        [4, null, '31.0', '2021-06-11'],
        [5, '12.7', null, '2021-06-12'],
        [6, '19.9', null, '2021-06-13'],
      ]);

      // The cleaning config reads each measurement type as a property column of a wide file would be
      const dataMapping = await addDataMapping(mapping);
      const config = await new DataMappingService().parseDataMapping(requestData, dataMapping.id);
      expect(Object.keys(config.property_cols)).toEqual(['s1', 's2']);
      expect(config.property_cols['s1']).toMatchObject({ property_id: property.id, standard_unit: 'mg/kg' });
      expect(config.property_cols['s2']).toMatchObject({ property_id: property.id, min_val: 1 });
      expect(config.metadata_cols).toMatchObject({
        min_depth: 'min_depth',
        max_depth: 'max_depth',
        sampling_date: 'sampling_date',
        license: 'license',
      });
    });

    it('fails with FTD_LONG_TABLE_NOT_FOUND when the file was not staged as long', async () => {
      const file = await createFile('long_local_codes.csv');
      const property = await addSoilProperty('P', (await addCategory()).id);
      await linkMapping(file, localCodesMapping(property.slug, ['pH_H2O']));

      await expect(fileService.fileToDB(requestData, file.slug)).rejects.toMatchObject({
        name: 'JobError',
        code: 'FTD_LONG_TABLE_NOT_FOUND',
      });
      const reloaded = await entityManager.findOneByOrFail(FileEntity, { id: file.id });
      expect(reloaded.status).toBe(IngestionStatus.PENDING);
    });

    it('fails with FTD_LONG_COLUMN_NOT_FOUND when a role column is not in the file', async () => {
      const file = await createFile('long_local_codes.csv');
      const property = await addSoilProperty('P', (await addCategory()).id);
      const mapping = localCodesMapping(property.slug, ['pH_H2O']);
      mapping.long_format.value_col = 'result';
      await linkMapping(file, mapping);
      await fileService.longStage(requestData, file.slug);

      await expect(fileService.fileToDB(requestData, file.slug)).rejects.toMatchObject({
        name: 'JobError',
        code: 'FTD_LONG_COLUMN_NOT_FOUND',
        params: { column: 'result' },
      });
    });
  });
});
