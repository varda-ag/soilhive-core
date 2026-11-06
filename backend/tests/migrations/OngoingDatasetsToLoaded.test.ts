import { describe, it, expect } from '@jest/globals';
import { OngoingDatasetsToLoaded1793112500000 } from '../../src/migrations/1793112500000-OngoingDatasetsToLoaded';
import DatasetEntity from '../../src/entities/Dataset';
import { IngestionStatus } from '../../src/types/data';
import { getDataSource } from '../../src/utils/data-source';
import { addDataset, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';

const statusOf = async (id: string): Promise<IngestionStatus> =>
  (await (await getDataSource()).getRepository(DatasetEntity).findOneByOrFail({ id })).status;

const setStatus = async (id: string, status: IngestionStatus): Promise<void> => {
  await (await getDataSource()).query(`UPDATE datasets SET status = $2 WHERE id = $1`, [id, status]);
};

const runMigration = async (): Promise<void> => {
  const queryRunner = (await getDataSource()).createQueryRunner();
  try {
    await new OngoingDatasetsToLoaded1793112500000().up(queryRunner);
  } finally {
    await queryRunner.release();
  }
};

describe('OngoingDatasetsToLoaded migration', () => {
  it('makes an ONGOING dataset with loaded data LOADED, one without PENDING, and leaves the others alone', async () => {
    const { dataset: loaded } = await addSyntheticData({ ...syntheticDataOptions, id: 401, featureCount: 1 });
    const empty = await addDataset('ongoing-empty', [0, 0, 1, 1]);
    const published = await addDataset('not-ongoing', [0, 0, 1, 1]);
    await setStatus(loaded.id, IngestionStatus.ONGOING);
    await setStatus(empty.id, IngestionStatus.ONGOING);

    await runMigration();

    expect(await statusOf(loaded.id)).toBe(IngestionStatus.LOADED);
    // A first load that wrote nothing: back through the steps
    expect(await statusOf(empty.id)).toBe(IngestionStatus.PENDING);
    expect(await statusOf(published.id)).toBe(IngestionStatus.PUBLISHED);
  });
});
