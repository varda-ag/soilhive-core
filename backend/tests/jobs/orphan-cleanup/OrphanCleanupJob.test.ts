import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import FileEntity from '../../../src/entities/File';
import DatasetFileMappingEntity from '../../../src/entities/DatasetFileMapping';
import { processOrphanCleanup } from '../../../src/jobs/orphan-cleanup/OrphanCleanupJob';
import { IngestionStatus } from '../../../src/types/data';
import { getDataSource } from '../../../src/utils/data-source';
import { addFile, addDataset, addDataMapping } from '../../../src/utils/mock';
import FileService from '../../../src/services/FileService';
import { getLongTableName, getRawTableName } from '../../../src/utils/utils';

const makeOld = async (fileId: string, daysAgo = 8) => {
  const dataSource = await getDataSource();
  await dataSource.getRepository(FileEntity).update(fileId, {
    created_at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
  });
};

const createStagingTable = async (fileId: string) => {
  const dataSource = await getDataSource();
  await dataSource.query(`CREATE TABLE IF NOT EXISTS "${process.env.POSTGRES_SCHEMA}"."${getRawTableName(fileId)}" (id serial)`);
};

const createLongTable = async (fileId: string) => {
  const dataSource = await getDataSource();
  await dataSource.query(`CREATE TABLE IF NOT EXISTS "${process.env.POSTGRES_SCHEMA}"."${getLongTableName(fileId)}" (source_id serial)`);
};

const longTableExists = async (fileId: string): Promise<boolean> => {
  const dataSource = await getDataSource();
  const result = await dataSource.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [
    process.env.POSTGRES_SCHEMA,
    getLongTableName(fileId),
  ]);
  return result.length > 0;
};

const stagingTableExists = async (fileId: string): Promise<boolean> => {
  const dataSource = await getDataSource();
  const result = await dataSource.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`, [
    process.env.POSTGRES_SCHEMA,
    getRawTableName(fileId),
  ]);
  return result.length > 0;
};

describe('OrphanFileCleanupJob', () => {
  beforeEach(() => {
    jest.spyOn(FileService, 'getStorageEngine').mockReturnValue({ deleteFile: jest.fn<() => Promise<void>>().mockResolvedValue() } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hard-deletes a PENDING file older than 7 days with no dataset mapping', async () => {
    const file = await addFile('orphan_pending_file');
    const dataSource = await getDataSource();
    await dataSource.getRepository(FileEntity).update(file.id, { status: IngestionStatus.PENDING });
    await makeOld(file.id);

    await processOrphanCleanup();

    const found = await dataSource.getRepository(FileEntity).findOne({ where: { id: file.id }, withDeleted: true });
    expect(found).toBeNull();
  });

  it('does not delete a PENDING file older than 7 days that has a dataset mapping', async () => {
    const file = await addFile('mapped_pending_file');
    const dataSource = await getDataSource();
    await dataSource.getRepository(FileEntity).update(file.id, { status: IngestionStatus.PENDING });
    await makeOld(file.id);

    const dataset = await addDataset('test_dataset', [-180, -90, 180, 90]);
    const dataMapping = await addDataMapping({});
    await dataSource.getRepository(DatasetFileMappingEntity).save(
      dataSource.getRepository(DatasetFileMappingEntity).create({
        file_id: file.id,
        dataset_id: dataset.id,
        data_mapping_id: dataMapping.id,
      }),
    );

    await processOrphanCleanup();

    const found = await dataSource.getRepository(FileEntity).findOneBy({ id: file.id });
    expect(found).not.toBeNull();
  });

  describe('orphan staging table cleanup', () => {
    it('drops the staging table for a STAGED file older than 1 day with no mapping', async () => {
      const file = await addFile('orphan_staged_file');
      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).update(file.id, { status: IngestionStatus.STAGED });
      await makeOld(file.id, 2);
      await createStagingTable(file.id);

      await processOrphanCleanup();

      expect(await stagingTableExists(file.id)).toBe(false);
    });

    it('does not drop the staging table for a STAGED file older than 1 day that has an active mapping', async () => {
      const file = await addFile('mapped_staged_file');
      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).update(file.id, { status: IngestionStatus.STAGED });
      await makeOld(file.id, 2);
      await createStagingTable(file.id);

      const dataset = await addDataset('test_dataset_staged', [-180, -90, 180, 90]);
      const dataMapping = await addDataMapping({});
      await dataSource.getRepository(DatasetFileMappingEntity).save(
        dataSource.getRepository(DatasetFileMappingEntity).create({
          file_id: file.id,
          dataset_id: dataset.id,
          data_mapping_id: dataMapping.id,
        }),
      );

      await processOrphanCleanup();

      expect(await stagingTableExists(file.id)).toBe(true);
    });

    it('does not drop the staging table for a STAGED file younger than 1 day with no mapping', async () => {
      const file = await addFile('recent_staged_file');
      const dataSource = await getDataSource();
      await dataSource.getRepository(FileEntity).update(file.id, { status: IngestionStatus.STAGED });
      await createStagingTable(file.id);

      await processOrphanCleanup();

      expect(await stagingTableExists(file.id)).toBe(true);
    });
  });

  describe('orphan long table cleanup', () => {
    it('drops the long table of a soft-deleted file', async () => {
      const file = await addFile('deleted_long_file');
      await createLongTable(file.id);
      await (await getDataSource()).getRepository(FileEntity).softDelete(file.id);

      await processOrphanCleanup();

      expect(await longTableExists(file.id)).toBe(false);
    });

    it('drops the long table of a LOADED file', async () => {
      const file = await addFile('loaded_long_file');
      await (await getDataSource()).getRepository(FileEntity).update(file.id, { status: IngestionStatus.LOADED });
      await createLongTable(file.id);

      await processOrphanCleanup();

      expect(await longTableExists(file.id)).toBe(false);
    });

    it('drops the long table of an orphan file it hard-deletes', async () => {
      const file = await addFile('orphan_long_file');
      await (await getDataSource()).getRepository(FileEntity).update(file.id, { status: IngestionStatus.PENDING });
      await makeOld(file.id);
      await createLongTable(file.id);

      await processOrphanCleanup();

      expect(await longTableExists(file.id)).toBe(false);
    });

    it('keeps the long table of a file still being mapped', async () => {
      const file = await addFile('mapping_long_file');
      await (await getDataSource()).getRepository(FileEntity).update(file.id, { status: IngestionStatus.PENDING });
      await createLongTable(file.id);

      await processOrphanCleanup();

      expect(await longTableExists(file.id)).toBe(true);
    });
  });
});
