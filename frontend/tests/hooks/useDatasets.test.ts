import { useDatasets, useDataset } from 'hooks/useDatasets';

import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

describe('useDatasets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useDatasets', () => {
    it('polls the datasets list every 2 seconds', () => {
      (useApiQuery as jest.Mock).mockReturnValue({ data: [], isLoading: false, isError: false });

      useDatasets();

      expect(useApiQuery).toHaveBeenCalledWith({
        endpoint: '/datasets',
        method: 'GET',
        queryKey: ['datasets'],
        enabled: true,
        refetchInterval: 2000,
      });
    });
  });

  describe('useDataset', () => {
    it('does not poll a single dataset by id', () => {
      (useApiQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: false });

      useDataset('123');

      expect(useApiQuery).toHaveBeenCalledWith({
        endpoint: '/datasets/123',
        method: 'GET',
        queryKey: ['dataset', '123'],
        enabled: true,
        disableCache: true,
      });
    });
  });
});
