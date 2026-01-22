import { destroyDataSource, getDataSource } from '../../src/utils/data-source';
import { PREVIEW_PAGE_SIZE } from '../../src/constants/constants';
import { addSyntheticIngestionData, syntheticIngestionDataOptions } from '../../src/utils/mock';
import VectorDataLoad from '../../src/data-layer/VectorDataLoad';

describe('VectorDataLoad class', () => {
  it('Filtering should return some results', async () => {
    const { file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const dataSource = await getDataSource();
    const results = await vdl.getDataPreview(dataSource, file.id, dataMapping.id);
    await destroyDataSource();
    expect(results.length).toBe(PREVIEW_PAGE_SIZE);
    const resultBdfi33 = results.map(r => parseFloat(r.bdfi33));
    const minBdfi33 = Math.min(...resultBdfi33.filter(n => !isNaN(n)));
    expect(minBdfi33).toBeGreaterThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfi33.min_val);
    const resultBdfiod = results.map(r => parseFloat(r.bdfiod));
    const maxBdfiod = Math.max(...resultBdfiod.filter(n => !isNaN(n)));
    expect(maxBdfiod).toBeLessThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfiod.max_val);
  });
});