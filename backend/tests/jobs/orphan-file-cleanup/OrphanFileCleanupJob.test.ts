import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import FileEntity from '../../../src/entities/File';
import DatasetFileMappingEntity from '../../../src/entities/DatasetFileMapping';
import { processOrphanFileCleanup } from '../../../src/jobs/orphan-file-cleanup/OrphanFileCleanupJob';
import { IngestionStatus } from '../../../src/types/data';
import { getDataSource } from '../../../src/utils/data-source';
import { addFile, addDataset, addDataMapping } from '../../../src/utils/mock';
import FileService from '../../../src/services/FileService';

const makeOld = async (fileId: string) => {
  const dataSource = await getDataSource();
  await dataSource.getRepository(FileEntity).update(fileId, {
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  });
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

    await processOrphanFileCleanup();

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

    await processOrphanFileCleanup();

    const found = await dataSource.getRepository(FileEntity).findOneBy({ id: file.id });
    expect(found).not.toBeNull();
  });
});
