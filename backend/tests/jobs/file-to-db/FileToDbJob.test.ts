import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { Job } from 'pg-boss';
import { processFileToDb } from '../../../src/jobs/file-to-db/FileToDbJob';
import * as DatasetJobs from '../../../src/data-layer/DatasetJobs';
import DatasetFileMappingEntity from '../../../src/entities/DatasetFileMapping';
import { FileToDbJob } from '../../../src/interfaces/Job';
import { JobQueues } from '../../../src/types/enums';
import { getDataSource } from '../../../src/utils/data-source';
import { addDataMapping, addDataset, addDatasetFileMapping, addFile } from '../../../src/utils/mock';

const getJob = (file_id: string): Job<FileToDbJob> =>
  ({ id: 'mock-id', name: JobQueues.FILE_TO_DB, data: { type: 'file-to-db', file_id } }) as unknown as Job<FileToDbJob>;

let counter = 0;

/** A File mapped into a new Dataset. */
const mappedFile = async () => {
  counter += 1;
  const dataset = await addDataset(`file-to-db-job-${counter}`, [0, 0, 1, 1]);
  const file = await addFile(`file-to-db-job-${counter}`);
  const dfm = await addDatasetFileMapping(dataset.id, (await addDataMapping({})).id);
  await (await getDataSource()).getRepository(DatasetFileMappingEntity).update({ id: dfm.id }, { file_id: file.id });
  return { dataset, file };
};

describe('processFileToDb', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("FTD_DATASET_LOADING while a bulk-load of the file's dataset is running, without staging the file", async () => {
    const { dataset, file } = await mappedFile();
    const activeJob = jest.spyOn(DatasetJobs, 'getActiveJob').mockResolvedValue({ id: 'job-id', queue: JobQueues.BULK_LOAD });

    // Refused before fileToDB, which would otherwise fail on the File having no metadata
    await expect(processFileToDb(getJob(file.slug))).rejects.toMatchObject({ name: 'JobError', code: 'FTD_DATASET_LOADING' });

    expect(activeJob).toHaveBeenCalledWith(expect.anything(), [JobQueues.BULK_LOAD], [dataset.slug]);
  });

  it('goes on to stage the file when no bulk-load of its datasets is running', async () => {
    const { file } = await mappedFile();

    // Reaches fileToDB, whose own checks fail on a File with no metadata
    await expect(processFileToDb(getJob(file.slug))).rejects.toThrow(/Metadata not found/);
  });
});
