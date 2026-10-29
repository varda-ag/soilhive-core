import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { MapBasedFilters } from '../../../src/pages/AdminPortal/MapBasedFilters/MapBasedFilters';
import { useRaster } from 'hooks/useRaster';
import { ADMIN_PATHS } from 'configuration/admin';

let capturedTableProps: any = {};

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useRaster', () => ({
  useRaster: jest.fn(),
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: any) => (
    <button data-testid="mock-button" onClick={onClick}>
      {children}
    </button>
  ),
  Loader: () => <div data-testid="mock-loader" />,
}));

jest.mock('components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTable', () => ({
  MapBasedFiltersTable: (props: any) => {
    capturedTableProps = props;
    return <div data-testid="mock-filters-table" data-count={props.filters.length} />;
  },
}));

describe('MapBasedFilters page', () => {
  const mockCategories = [
    { id: 'lc', name: 'Land Cover', enabled: true, active: true },
    { id: 'sg', name: 'Soil Groups', enabled: false, active: false },
    { id: 'az', name: 'Agroecological Zones', enabled: true, active: false },
  ];

  const navigate = jest.fn();
  const setCategoryActive = jest.fn();

  const mockRaster = (overrides?: Record<string, unknown>) =>
    (useRaster as jest.Mock).mockReturnValue({
      allCategories: mockCategories,
      setCategoryActive,
      isLoading: false,
      isActivationPending: false,
      ...overrides,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    capturedTableProps = {};
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    mockRaster();
  });

  it('matches snapshot', () => {
    const { container } = render(<MapBasedFilters />);
    expect(container).toMatchSnapshot();
  });

  it('polls the raster categories every 2 seconds', () => {
    render(<MapBasedFilters />);

    expect(useRaster).toHaveBeenCalledWith(2000);
  });

  describe('intro section', () => {
    it('renders the title', () => {
      render(<MapBasedFilters />);

      expect(screen.getByRole('heading', { name: 'Map-based filters' })).toBeInTheDocument();
    });

    it('renders the description', () => {
      render(<MapBasedFilters />);

      // The Trans mock renders its i18nKey.
      expect(screen.getByText('filters.intro.description')).toBeInTheDocument();
    });
  });

  describe('while loading', () => {
    beforeEach(() => mockRaster({ isLoading: true }));

    it('renders the loader', () => {
      render(<MapBasedFilters />);

      expect(screen.getByTestId('mock-loader')).toBeInTheDocument();
    });

    it('renders neither the Add filters button nor the table', () => {
      render(<MapBasedFilters />);

      expect(screen.queryByText('Add filters')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-filters-table')).not.toBeInTheDocument();
    });
  });

  describe('once loaded', () => {
    it('does not render the loader', () => {
      render(<MapBasedFilters />);

      expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
    });

    it('renders the Add filters button', () => {
      render(<MapBasedFilters />);

      expect(screen.getByTestId('mock-button')).toHaveTextContent('Add filters');
    });

    it('navigates to the new filter page when Add filters is clicked', () => {
      render(<MapBasedFilters />);

      fireEvent.click(screen.getByTestId('mock-button'));

      expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.FILTERS}/new`);
    });

    it('passes the categories to the table', () => {
      render(<MapBasedFilters />);

      expect(screen.getByTestId('mock-filters-table')).toHaveAttribute('data-count', '3');
      expect(capturedTableProps.filters).toBe(mockCategories);
    });

    it('passes isActivationPending to the table', () => {
      mockRaster({ isActivationPending: true });
      render(<MapBasedFilters />);

      expect(capturedTableProps.isActivationPending).toBe(true);
    });

    it('passes an empty list to the table when there are no categories', () => {
      mockRaster({ allCategories: undefined });
      render(<MapBasedFilters />);

      expect(capturedTableProps.filters).toEqual([]);
    });

    it('passes setCategoryActive to the table', () => {
      render(<MapBasedFilters />);

      capturedTableProps.onSetCategoryActive('lc', false);

      expect(setCategoryActive).toHaveBeenCalledWith('lc', false);
    });
  });
});
