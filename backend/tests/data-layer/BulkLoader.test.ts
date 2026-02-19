//import { v7 as uuidv7 } from 'uuid';
import { addSyntheticIngestionData, syntheticIngestionDataOptions, getLoadedDataCount } from '../../src/utils/mock';
import BulkLoader from '../../src/jobs/bulk-load/BulkLoader';
import { BulkLoadJob } from '../../src/interfaces/Job';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/app';
import { getDataAdminToken } from '../helper';

describe('BulkLoader class', () => {
  beforeEach(() => {
    process.env.LOCAL_STORAGE_ROOT_FOLDER = path.join(__dirname, '../assets/vector_files/pass');
  });

  it('Bulk loading synthetic data', async () => {
    // Clone options and remove filters
    const options = JSON.parse(JSON.stringify(syntheticIngestionDataOptions));
    delete options.columnMapping.bdfi33.max_val;
    delete options.columnMapping.bdfiod.min_val;
    delete options.columnMapping.drop_records;

    const { dataset } = await addSyntheticIngestionData({ ...options });

    const token = await getDataAdminToken();

    const bulkLoader = new BulkLoader();

    const mockMakeRequest = jest
      .spyOn(bulkLoader, 'makeRequest')
      .mockImplementation(async (datasetSlug: string, datasetFileMappingId: string, payload: any) => {
        const response = await request(app)
          .post(`/datasets/${datasetSlug}/dataset-file-mapping/${datasetFileMappingId}/soil-data`)
          .set('Authorization', `Bearer ${token}`)
          .send(payload);
        return response;
      });

    const job: BulkLoadJob = {
      type: 'bulk-load',
      created_by: 'test-user',
      progress_percentage: 0,
      dataset_id: dataset.slug,
    };

    await bulkLoader.startBulkLoad(job);

    const createdData = await getLoadedDataCount();
    expect(createdData.n_features).toBe(2);
    expect(createdData.n_layers).toBe(17);
    expect(createdData.n_dataset_layers).toBe(20);
    expect(createdData.n_observations).toBe(22);

    mockMakeRequest.mockRestore();
  });
});
