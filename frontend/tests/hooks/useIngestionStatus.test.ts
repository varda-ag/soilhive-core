import { renderHook, act } from '@testing-library/react';
import { useIngestionStatus } from 'hooks/useIngestionStatus';
import useConfig from 'hooks/useConfig';

jest.mock('hooks/useConfig', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockUseConfig = useConfig as jest.MockedFunction<typeof useConfig>;

describe('useIngestionStatus', () => {
  let mockSaveConfig: jest.Mock;

  beforeEach(() => {
    mockSaveConfig = jest.fn().mockResolvedValue(undefined);
  });

  function setup(config: Record<string, unknown> = {}, isLoading = false) {
    mockUseConfig.mockReturnValue({ config, isLoading, isError: false, saveConfig: mockSaveConfig } as any);
    return renderHook(() => useIngestionStatus());
  }

  describe('getFurthestStep', () => {
    it('returns general-info when no entry exists for the slug', () => {
      const { result } = setup({});
      expect(result.current.getFurthestStep('my-dataset')).toBe('general-info');
    });

    it('returns the stored furthest step for the slug', () => {
      const { result } = setup({ 'my-dataset': { furthestStep: 'mappings' } });
      expect(result.current.getFurthestStep('my-dataset')).toBe('mappings');
    });
  });

  describe('updateFurthestStep', () => {
    it('writes to config when the new step is further than stored', async () => {
      const { result } = setup({ 'my-dataset': { furthestStep: 'soil-data' } });
      await act(async () => {
        await result.current.updateFurthestStep('my-dataset', 'mappings');
      });
      expect(mockSaveConfig).toHaveBeenCalledWith({ 'my-dataset': { furthestStep: 'mappings' } });
    });

    it('does not write to config when the new step is the same as stored', async () => {
      const { result } = setup({ 'my-dataset': { furthestStep: 'mappings' } });
      await act(async () => {
        await result.current.updateFurthestStep('my-dataset', 'mappings');
      });
      expect(mockSaveConfig).not.toHaveBeenCalled();
    });

    it('does not write to config when the new step is earlier than stored', async () => {
      const { result } = setup({ 'my-dataset': { furthestStep: 'preview' } });
      await act(async () => {
        await result.current.updateFurthestStep('my-dataset', 'soil-data');
      });
      expect(mockSaveConfig).not.toHaveBeenCalled();
    });
  });

  describe('clearDatasetStatus', () => {
    it('removes the slug entry and preserves other entries', async () => {
      const { result } = setup({ 'my-dataset': { furthestStep: 'mappings' }, other: { furthestStep: 'preview' } });
      await act(async () => {
        await result.current.clearDatasetStatus('my-dataset');
      });
      expect(mockSaveConfig).toHaveBeenCalledWith({ other: { furthestStep: 'preview' } });
    });

    it('does not write to config when the slug is not present', async () => {
      const { result } = setup({ other: { furthestStep: 'preview' } });
      await act(async () => {
        await result.current.clearDatasetStatus('my-dataset');
      });
      expect(mockSaveConfig).not.toHaveBeenCalled();
    });
  });
});
