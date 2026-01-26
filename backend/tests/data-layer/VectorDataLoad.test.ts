import { getEntityManager } from '../../src/utils/data-source';
import { DATA_PREVIEW_SIZE } from '../../src/constants/constants';
import { addSyntheticIngestionData, syntheticIngestionDataOptions } from '../../src/utils/mock';
import VectorDataLoad from '../../src/data-layer/VectorDataLoad';
import DataMappingService from '../../src/services/DataMappingService';

describe('VectorDataLoad class', () => {
  it('Filtering should return some results', async () => {
    const { file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const entityManager = await getEntityManager();
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id, file.id); // TODO: mock requestData
    const results = await vdl.getDataPreview(entityManager, dataMappingConfig);
    await entityManager.query(`DROP TABLE IF EXISTS "file_${file.id}_raw" CASCADE`);
    expect(results.length).toBe(DATA_PREVIEW_SIZE);
    const resultBdfi33 = results.map(r => parseFloat(r.bdfi33));
    const minBdfi33 = Math.min(...resultBdfi33.filter(n => !isNaN(n)));
    expect(minBdfi33).toBeGreaterThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfi33.min_val);
    const resultBdfiod = results.map(r => parseFloat(r.bdfiod));
    const maxBdfiod = Math.max(...resultBdfiod.filter(n => !isNaN(n)));
    expect(maxBdfiod).toBeLessThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfiod.max_val);
    const resultRecordIds = results.map(r => parseFloat(r.record_id));
    const minRecordId = Math.min(...resultRecordIds);
    expect(minRecordId).toBe(10003);
  });
});
