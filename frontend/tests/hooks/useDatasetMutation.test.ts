import { renderHook } from '@testing-library/react';
import { useApiMutation } from 'hooks/useApiMutation';
import {
  useCreateDatasetMutation,
  useUpdateDatasetMutation,
  useCreateDatasetFileMapping,
  useDeleteDatasetMutation,
} from 'hooks/useDatasetMutation';

jest.mock('hooks/useApiMutation', () => ({
  useApiMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

describe('useDatasetMutation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('useCreateDatasetMutation', () => {
    it('calls useApiMutation with POST /datasets', () => {
      renderHook(() => useCreateDatasetMutation());

      expect(useApiMutation).toHaveBeenCalledWith({
        endpoint: '/datasets',
        method: 'POST',
      });
    });
  });

  describe('useUpdateDatasetMutation', () => {
    it('calls useApiMutation with PATCH /datasets/:id', () => {
      renderHook(() => useUpdateDatasetMutation('abc-123'));

      expect(useApiMutation).toHaveBeenCalledWith({
        endpoint: '/datasets/abc-123',
        method: 'PATCH',
      });
    });
  });

  describe('useCreateDatasetFileMapping', () => {
    it('calls useApiMutation with POST and /datasets/:datasetId/dataset-file-mapping endpoint', () => {
      renderHook(() => useCreateDatasetFileMapping());

      expect(useApiMutation).toHaveBeenCalledWith({
        endpoint: expect.any(Function),
        method: 'POST',
      });

      const { endpoint } = (useApiMutation as jest.Mock).mock.calls[0][0];
      expect(endpoint({ datasetId: 'ds-99', column: 'foo', value: 'bar' })).toBe('/datasets/ds-99/dataset-file-mapping');
    });
  });

  describe('useDeleteDatasetMutation', () => {
    it('calls useApiMutation with DELETE and /datasets/:datasetId endpoint', () => {
      renderHook(() => useDeleteDatasetMutation());

      expect(useApiMutation).toHaveBeenCalledWith({
        endpoint: expect.any(Function),
        method: 'DELETE',
      });

      const { endpoint } = (useApiMutation as jest.Mock).mock.calls[0][0];
      expect(endpoint({ datasetId: 'ds-42' })).toBe('/datasets/ds-42');
    });
  });
});
