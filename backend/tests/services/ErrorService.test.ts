import { describe, it, expect, jest } from '@jest/globals';
import ErrorService from '../../src/services/ErrorService';

describe('ErrorService.getDatasetErrors', () => {
  const makeEntityManager = (rows: unknown[]) =>
    ({
      query: jest.fn().mockResolvedValue(rows),
    }) as any;

  it('returns empty array when no failed jobs exist', async () => {
    const service = new ErrorService();
    const result = await service.getDatasetErrors({ entityManager: makeEntityManager([]), entitlements: {} });
    expect(result).toEqual([]);
  });

  it('translates error codes to message and actions', async () => {
    const service = new ErrorService();
    const rows = [
      {
        dataset_id: 'ds-1',
        errors: [{ code: 'FTD_FILE_NOT_FOUND', params: {} }],
      },
    ];
    const result = await service.getDatasetErrors({ entityManager: makeEntityManager(rows), entitlements: {} });
    expect(result).toHaveLength(1);
    expect(result[0]!.dataset_id).toBe('ds-1');
    expect(result[0]!.errors[0]).toMatchObject({
      code: 'FTD_FILE_NOT_FOUND',
      message: expect.any(String),
      actions: expect.arrayContaining([expect.any(String)]),
      params: {},
    });
  });

  it('uses fallback translation for unknown error codes', async () => {
    const service = new ErrorService();
    const rows = [{ dataset_id: 'ds-2', errors: [{ code: 'UNKNOWN_CODE', params: { x: 1 } }] }];
    const result = await service.getDatasetErrors({ entityManager: makeEntityManager(rows), entitlements: {} });
    expect(result[0]!.errors[0]).toMatchObject({
      code: 'UNKNOWN_CODE',
      params: { x: 1 },
      message: expect.any(String),
      actions: expect.arrayContaining([expect.any(String)]),
    });
  });

  it('forwards detail when present in stored error', async () => {
    const service = new ErrorService();
    const rows = [{ dataset_id: 'ds-1', errors: [{ code: 'BL_RECORD_WRITE_FAILED', params: {}, detail: 'duplicate key value' }] }];
    const result = await service.getDatasetErrors({ entityManager: makeEntityManager(rows), entitlements: {} });
    expect(result[0]!.errors[0]!.detail).toBe('duplicate key value');
  });

  it('omits detail when absent from stored error', async () => {
    const service = new ErrorService();
    const rows = [{ dataset_id: 'ds-1', errors: [{ code: 'BL_RECORD_WRITE_FAILED', params: {} }] }];
    const result = await service.getDatasetErrors({ entityManager: makeEntityManager(rows), entitlements: {} });
    expect(result[0]!.errors[0]!.detail).toBeUndefined();
  });

  it('handles multiple datasets each with their own error', async () => {
    const service = new ErrorService();
    const rows = [
      { dataset_id: 'ds-1', errors: [{ code: 'FTD_NO_DATA_COLUMNS', params: {} }] },
      { dataset_id: 'ds-2', errors: [{ code: 'BL_RECORD_WRITE_FAILED', params: {} }] },
    ];
    const result = await service.getDatasetErrors({ entityManager: makeEntityManager(rows), entitlements: {} });
    expect(result).toHaveLength(2);
    expect(result.map(r => r.dataset_id)).toEqual(['ds-1', 'ds-2']);
  });
});
