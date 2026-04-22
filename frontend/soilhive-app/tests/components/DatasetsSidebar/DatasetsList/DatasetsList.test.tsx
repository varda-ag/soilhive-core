import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsList } from 'components/DatasetsSidebar/DatasetsList/DatasetsList';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DatasetsSidebar/DatasetsList/DatasetsListItem/DatasetsListItem', () => ({
  DatasetsListItem: (props: any) => (
    <div data-testid="mock-datasets-list-item">Mock DatasetsListItem with props: {JSON.stringify(props)}</div>
  ),
}));

jest.mock('components/DatasetsSidebar/DatasetsList/DatasetsFilters/DatasetsFilters', () => ({
  DatasetsFilters: () => <div data-testid="mock-datasets-filters">Mock DatasetsFilters</div>,
}));

describe('DatasetsList', () => {
  const mockSelectAllDatasets = jest.fn();
  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasets: [
        {
          name: 'Test dataset 1',
          id: 'test-dataset-1',
        },
        {
          name: 'Test dataset 2',
          id: 'test-dataset-2',
        },
        {
          name: 'Test dataset 3',
          id: 'test-dataset-3',
        },
      ],
      selectAllDatasets: mockSelectAllDatasets,
      isAllSelected: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders datasets list', () => {
    const { container } = render(<DatasetsList />);

    expect(screen.getByTestId('sh-datasets-list')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('mock-datasets-filters')).toBeInTheDocument();
    expect(screen.getAllByTestId('mock-datasets-list-item')).toHaveLength(3);
    expect(container).toMatchSnapshot();
  });

  it('calls selectAllDatasets on the Select All checkbox click', () => {
    render(<DatasetsList />);

    const selectAllCheckbox = screen.getByRole('checkbox');
    fireEvent.click(selectAllCheckbox);

    expect(mockSelectAllDatasets).toHaveBeenCalledWith(true, undefined);
  });

  it('renders loading state', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasets: [],
      selectAllDatasets: mockSelectAllDatasets,
      isAllSelected: false,
      isDatasetsLoading: true,
      isNoData: false,
      isNoFilteredData: false,
    });

    render(<DatasetsList />);

    expect(screen.queryByTestId('skeleton-container')).toBeInTheDocument();
  });

  it('renders no data state', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasets: [],
      selectAllDatasets: mockSelectAllDatasets,
      isAllSelected: false,
      isDatasetsLoading: false,
      isNoData: true,
      isNoFilteredData: false,
    });

    render(<DatasetsList />);

    expect(screen.getByText('Select a different area to explore available datasets')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-datasets-list')).not.toBeInTheDocument();
  });

  it('renders no filtered data state', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasets: [],
      selectAllDatasets: mockSelectAllDatasets,
      isAllSelected: false,
      isDatasetsLoading: false,
      isNoData: false,
      isNoFilteredData: true,
    });

    render(<DatasetsList />);

    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
    expect(screen.getByText('This is due to applied filters')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-datasets-list')).not.toBeInTheDocument();
  });

  it('renders not matching search query state', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasets: [],
      selectAllDatasets: mockSelectAllDatasets,
      isAllSelected: false,
      isDatasetsLoading: false,
      isNoData: false,
      isNoFilteredData: false,
      searchValue: 'test-search',
    });

    render(<DatasetsList />);

    expect(screen.getByText('No data in selected area matching your search query')).toBeInTheDocument();
  });
});
