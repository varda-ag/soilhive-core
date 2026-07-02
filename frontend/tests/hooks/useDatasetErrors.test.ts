import { useDatasetErrors } from 'hooks/useDatasetErrors';

import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

describe('useDatasetErrors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('polls the dataset errors list every 2 seconds', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    useDatasetErrors();

    expect(useApiQuery).toHaveBeenCalledWith({
      endpoint: '/errors/datasets',
      method: 'GET',
      queryKey: ['datasetErrors'],
      enabled: true,
      refetchInterval: 2000,
    });
  });
});
