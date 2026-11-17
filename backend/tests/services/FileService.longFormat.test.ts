import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { EntityManager } from 'typeorm';
import FileService from '../../src/services/FileService';
import DataMappingService from '../../src/services/DataMappingService';
import FileEntity from '../../src/entities/File';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { addCategory, addDataMapping, addProcedure, addSoilProperty, linkMapping } from '../../src/utils/mock';
import { getLongTableName, getRawTableName } from '../../src/utils/utils';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { IngestionStatus, ProcedureTechnique } from '../../src/types/data';
import SoilPropertyEntity from '../../src/entities/SoilProperty';
import ProcedureEntity from '../../src/entities/Procedure';
import { JobQueues } from '../../src/types/enums';
import { DataMappingObject, MAX_MEASUREMENT_TYPES } from '../../src/types/DataMapping';
import { VectorFileMetadata } from '../../src/interfaces/File';
import { CellDeleteReason } from '../../src/interfaces/CleaningReport';
import VectorDataLoad from '../../src/data-layer/VectorDataLoad';
import DataMappingEntity from '../../src/entities/DataMapping';
import DatasetFileMappingEntity from '../../src/entities/DatasetFileMapping';
import * as DatasetJobs from '../../src/data-layer/DatasetJobs';
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

  afterEach(() => {
    jest.restoreAllMocks();
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

    // long_xy_columns.csv names its coordinates east and north, which are not detected
    const stagedPoints = async (file: FileEntity): Promise<string[]> =>
      (
        await (
          await getDataSource()
        ).query(`SELECT ST_AsText(geometry) AS wkt FROM "${process.env.POSTGRES_SCHEMA}"."${getLongTableName(file.id)}" ORDER BY source_id`)
      ).map((r: { wkt: string }) => r.wkt);

    it('reads the latitude and longitude columns the job names, before any mapping is saved', async () => {
      const file = await createFile('long_xy_columns.csv');
      const metadata = file.metadata as VectorFileMetadata;
      expect(metadata.geometry_detected).toBe(false);
      expect(metadata.detected_fields.latitude).toBeNull();

      await fileService.longStage(requestData, file.slug, { lat_col: 'north', lon_col: 'east' });

      expect(await stagedPoints(file)).toEqual([
        'POINT(12.8 42.4)',
        'POINT(12.8 42.4)',
        'POINT(139.6917 35.6895)',
        'POINT(139.6917 35.6895)',
      ]);
    });

    it('reads the columns the job names ahead of the saved mapping', async () => {
      const file = await createFile('long_xy_columns.csv');
      // Saved with latitude and longitude the wrong way round
      await linkMapping(file, { east: 'latitude', north: 'longitude' });

      await fileService.longStage(requestData, file.slug);
      expect((await stagedPoints(file))[0]).toBe('POINT(42.4 12.8)');

      await fileService.longStage(requestData, file.slug, { lat_col: 'north', lon_col: 'east' });
      expect((await stagedPoints(file))[0]).toBe('POINT(12.8 42.4)');
    });

    it('fails with LS_GEOMETRY_NOT_FOUND when no geometry is given, saved or detected', async () => {
      const file = await createFile('long_xy_columns.csv');

      await expect(fileService.longStage(requestData, file.slug)).rejects.toMatchObject({
        name: 'JobError',
        code: 'LS_GEOMETRY_NOT_FOUND',
      });
    });

    it('fails with LS_COLUMN_NOT_FOUND for a geometry column the file does not have', async () => {
      const file = await createFile('long_xy_columns.csv');

      await expect(fileService.longStage(requestData, file.slug, { lat_col: 'lat', lon_col: 'east' })).rejects.toMatchObject({
        name: 'JobError',
        code: 'LS_COLUMN_NOT_FOUND',
        params: { column: 'lat' },
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

    it('counts the rows the pivot leaves out, for the preview stats', async () => {
      const name = 'long_left_out.csv';
      fs.writeFileSync(
        path.join(vectorFilesPassPath, name),
        [
          'WKT,top,bottom,det,conc',
          'POINT (12.8 42.4),0,20,pH,6.8',
          'POINT (12.8 42.4),0,20,pH,6.8',
          'POINT (12.8 42.4),0,20,clay,30',
          'POINT (12.8 42.4),0,20,clay,',
          'POINT (12.8 42.4),0,20,,5',
          'POINT (12.8 42.4),0,20,silt,12',
          '',
        ].join('\n'),
      );
      const file = await createFile(name);
      const property = await addSoilProperty('P', (await addCategory()).id);
      const mapping = localCodesMapping(property.slug, ['pH', 'clay']);
      await linkMapping(file, mapping);
      await fileService.longStage(requestData, file.slug);

      await fileService.fileToDB(requestData, file.slug);

      // One row for each reason: the repeated pH, the clay with no value, the value with no code and the silt
      const expected = {
        source_rows: 6,
        empty_value_rows: 1,
        empty_property_rows: 1,
        unmapped_measurement_type_rows: 1,
        repeated_values_removed: 1,
      };
      const reloaded = await entityManager.findOneByOrFail(FileEntity, { id: file.id });
      expect((reloaded.metadata as VectorFileMetadata).long_format_stats).toEqual(expected);
      const config = await new DataMappingService().parseDataMapping(requestData, (await addDataMapping(mapping)).id);
      const stats = await new VectorDataLoad().getDataPreviewStats(entityManager, config, file.id);
      expect(stats.long_format).toEqual(expected);
    });

    it('drops the long table and the pivot counts when the file is staged as wide', async () => {
      const file = await createFile('long_local_codes.csv');
      const property = await addSoilProperty('P', (await addCategory()).id);
      await linkMapping(file, localCodesMapping(property.slug, ['pH_H2O']));
      await fileService.longStage(requestData, file.slug);
      await fileService.fileToDB(requestData, file.slug);
      // The user switches the file to wide and saves its mapping
      const link = await entityManager.findOneOrFail(DatasetFileMappingEntity, {
        where: { file_id: file.id },
        relations: ['data_mapping'],
      });
      await entityManager.update(DataMappingEntity, link.data_mapping.id, {
        data_mapping: { top: 'min_depth', bottom: 'max_depth', conc: { property_id: property.slug } } as DataMappingObject,
      });

      await fileService.fileToDB(requestData, file.slug);

      expect(await getTableColumns(getLongTableName(file.id))).toEqual([]);
      const reloaded = await entityManager.findOneByOrFail(FileEntity, { id: file.id });
      expect(reloaded.status).toBe(IngestionStatus.STAGED);
      expect((reloaded.metadata as VectorFileMetadata).long_format_stats).toBeUndefined();
      expect((reloaded.metadata as VectorFileMetadata).field_names).toContain('det');
    });

    it('takes the class code of a categorical property from the value column, not its label', async () => {
      const name = 'long_classes.csv';
      fs.writeFileSync(
        path.join(vectorFilesPassPath, name),
        [
          'WKT,min_depth,max_depth,soil_property,value,value_label',
          'POINT (12.8 42.4),0,20,texture,8,Silty Loam',
          'POINT (12.8 42.4),0,20,ph,6.8,',
          'POINT (139.6917 35.6895),0,20,texture,1,Clay',
          'POINT (139.6917 35.6895),0,20,ph,5.9,',
          'POINT (36.8219 -1.2921),0,20,texture,8,Silty Loam',
          'POINT (36.8219 -1.2921),0,20,ph,6.2,',
          '',
        ].join('\n'),
      );
      const file = await createFile(name);
      // An export of SoilHive has both columns: the code is what the loader stores
      expect((file.metadata as VectorFileMetadata).detected_long_roles).toMatchObject({
        property_col: 'soil_property',
        value_col: 'value',
      });
      const category = await addCategory();
      const texture = await addSoilProperty('Texture', category.id, undefined, { '1': { label: 'Clay' }, '8': { label: 'Silty Loam' } });
      const ph = await addSoilProperty('pH', category.id);
      const mapping = {
        min_depth: 'min_depth',
        max_depth: 'max_depth',
        long_format: {
          property_col: 'soil_property',
          value_col: 'value',
          measurement_types: [
            { col: 's1', match: { property: 'texture' }, property_id: texture.slug },
            { col: 's2', match: { property: 'ph' }, property_id: ph.slug },
          ],
        },
      };
      await linkMapping(file, mapping);
      await fileService.longStage(requestData, file.slug);

      await fileService.fileToDB(requestData, file.slug);

      const rows = await rawRows(file);
      expect(rows.map(r => [r.record_id, r.s1, r.s2])).toEqual([
        [1, '8', '6.8'],
        [3, '1', '5.9'],
        [5, '8', '6.2'],
      ]);
      const config = await new DataMappingService().parseDataMapping(requestData, (await addDataMapping(mapping)).id);
      const stats = await new VectorDataLoad().getDataPreviewStats(entityManager, config, file.id);
      expect(stats.cell_deletions.filter(d => d.reason === CellDeleteReason.UNKNOWN_CLASS)).toEqual([]);
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

  describe('getMeasurementTypes', () => {
    it('lists one measurement type per property code, with its rows and value range', async () => {
      const file = await createFile('long_local_codes.csv');
      await fileService.longStage(requestData, file.slug);

      const types = await fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' });

      expect(types.map(t => t.match).sort((a, b) => (a.property! < b.property! ? -1 : 1))).toEqual(
        [{ property: 'OC_WB' }, { property: 'P_OLSEN_2' }, { property: 'XK_17' }, { property: 'pH_H2O' }].sort((a, b) =>
          a.property! < b.property! ? -1 : 1,
        ),
      );
      expect(types.find(t => t.match.property === 'P_OLSEN_2')).toMatchObject({
        row_count: 3,
        min_value: 8.1,
        max_value: 22.5,
        non_numeric_count: 0,
      });
    });

    it('counts the values that are no number', async () => {
      const file = await createFile('long_local_codes.csv');
      await fileService.longStage(requestData, file.slug);

      const [type] = await fileService.getMeasurementTypes(requestData, file.slug, { value_col: 'lab' }, 'any-property');

      expect(type).toMatchObject({ match: {}, row_count: 12, min_value: null, max_value: null, non_numeric_count: 12 });
    });

    it('suggests the answers of an earlier mapping, and the property a code is named after', async () => {
      const category = await addCategory();
      const mapped = await addSoilProperty('Olsen phosphorus', category.id);
      const named = await addSoilProperty('XK_17', category.id);
      await addDataMapping({
        long_format: {
          property_col: 'analyte',
          value_col: 'result',
          measurement_types: [{ col: 's1', match: { property: 'p_olsen_2' }, property_id: mapped.slug, max_val: 500 }],
        },
      });
      const file = await createFile('long_local_codes.csv');
      await fileService.longStage(requestData, file.slug);

      const types = await fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' });

      const suggestion = (code: string) => types.find(t => t.match.property === code)?.suggestion;
      expect(suggestion('P_OLSEN_2')).toEqual({ property_id: mapped.slug, max_val: 500 });
      expect(suggestion('XK_17')).toEqual({ property_id: named.slug });
      expect(suggestion('OC_WB')).toBeUndefined();
    });

    it('reads earlier answers from long mappings only, and suggests the procedures that still exist', async () => {
      const name = 'long_earlier_answers.csv';
      fs.writeFileSync(
        path.join(vectorFilesPassPath, name),
        ['WKT,det,conc', 'POINT (12.8 42.4),K_EXCH_7,0.4', 'POINT (12.8 42.4),NA_EXCH_7,0.2', 'POINT (12.8 42.4),CA_EXCH_7,4.1', ''].join(
          '\n',
        ),
      );
      const category = await addCategory();
      const property = await addSoilProperty('Exchangeable bases', category.id);
      const procedure = await addProcedure(`pretreatment-${Date.now()}`);
      // A wide mapping with a column named like a code is not an answer to it
      await addDataMapping({ CA_EXCH_7: { property_id: property.slug } });
      await addDataMapping({
        long_format: {
          property_col: 'analyte',
          value_col: 'result',
          measurement_types: [
            { col: 's1', match: { property: 'K_EXCH_7' }, property_id: property.slug, procedure_id: procedure.slug },
            { col: 's2', match: { property: 'NA_EXCH_7' }, property_id: property.slug, procedure_id: 'deleted-procedure' },
          ],
        },
      });
      const file = await createFile(name);
      await fileService.longStage(requestData, file.slug);

      const types = await fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' });

      const suggestion = (code: string) => types.find(t => t.match.property === code)?.suggestion;
      expect(suggestion('K_EXCH_7')).toEqual({ property_id: property.slug, procedure_id: procedure.slug });
      expect(suggestion('NA_EXCH_7')).toEqual({ property_id: property.slug });
      expect(suggestion('CA_EXCH_7')).toBeUndefined();
    });

    it('suggests a renamed property and procedure of an earlier answer by their current slugs', async () => {
      const name = 'long_renamed.csv';
      fs.writeFileSync(path.join(vectorFilesPassPath, name), ['WKT,det,conc', 'POINT (12.8 42.4),MG_EXCH_9,1.3', ''].join('\n'));
      const property = await addSoilProperty(`Magnesium before rename ${Date.now()}`, (await addCategory()).id);
      const procedure = await addProcedure(`pretreatment-renamed-${Date.now()}`);
      await addDataMapping({
        long_format: {
          property_col: 'analyte',
          value_col: 'result',
          measurement_types: [{ col: 's1', match: { property: 'MG_EXCH_9' }, property_id: property.slug, procedure_id: procedure.slug }],
        },
      });
      // The triggers give both new slugs and keep the old ones in slug_history
      await entityManager.update(SoilPropertyEntity, property.id, { property_name: `Magnesium after rename ${Date.now()}` });
      await entityManager.update(ProcedureEntity, procedure.id, { technique: ProcedureTechnique.CALCULATED });
      const renamedProperty = await entityManager.findOneByOrFail(SoilPropertyEntity, { id: property.id });
      const renamedProcedure = await entityManager.findOneByOrFail(ProcedureEntity, { id: procedure.id });
      expect([renamedProperty.slug, renamedProcedure.slug]).not.toEqual([property.slug, procedure.slug]);
      const file = await createFile(name);
      await fileService.longStage(requestData, file.slug);

      const [type] = await fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' });

      expect(type!.suggestion).toEqual({ property_id: renamedProperty.slug, procedure_id: renamedProcedure.slug });
    });

    it('answers 400 for a column that is not in the file', async () => {
      const file = await createFile('long_local_codes.csv');
      await fileService.longStage(requestData, file.slug);

      await expect(
        fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det"; DROP TABLE files; --', value_col: 'conc' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('answers 404 for a file that was not staged as long', async () => {
      const file = await createFile('long_local_codes.csv');

      await expect(
        fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('answers 422 for more measurement types than a mapping can hold', async () => {
      const name = 'long_many_types.csv';
      const rows = Array.from({ length: MAX_MEASUREMENT_TYPES + 1 }, (_, i) => `POINT (12.8 42.4),CODE_${i},${i}`);
      fs.writeFileSync(path.join(vectorFilesPassPath, name), ['WKT,det,conc', ...rows].join('\n'));
      const file = await createFile(name);
      await fileService.longStage(requestData, file.slug);

      await expect(
        fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' }),
      ).rejects.toMatchObject({ status: 422, extensions: { code: 'FTD_LONG_TOO_MANY_MEASUREMENT_TYPES' } });
    });

    it('answers 409 while long-stage is queued or running for the file', async () => {
      const file = await createFile('long_local_codes.csv');
      await fileService.longStage(requestData, file.slug);
      const staging = jest.spyOn(DatasetJobs, 'hasActiveFileJob').mockResolvedValue(true);

      await expect(
        fileService.getMeasurementTypes(requestData, file.slug, { property_col: 'det', value_col: 'conc' }),
      ).rejects.toMatchObject({ status: 409 });
      // A queued job counts too
      expect(staging).toHaveBeenCalledWith(entityManager, JobQueues.LONG_STAGE, expect.objectContaining({ id: file.id }), true);
    });
  });
});
