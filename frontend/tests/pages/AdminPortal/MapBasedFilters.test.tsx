import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { MapBasedFilters } from '../../../src/pages/AdminPortal/MapBasedFilters/MapBasedFilters';
import { useRaster } from 'hooks/useRaster';
import { useDeleteRasterFilter } from 'hooks/useDeleteRasterFilter';
import { ADMIN_PATHS } from 'configuration/admin';

let capturedTableProps: any = {};

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useRaster', () => ({
  useRaster: jest.fn(),
}));

jest.mock('hooks/useDeleteRasterFilter', () => ({
  useDeleteRasterFilter: jest.fn(),
}));

// Renders nothing while closed, so the page snapshot is unaffected
jest.mock('components/AdminPortal/RasterFilterDeleteModal/RasterFilterDeleteModal', () => ({
  RasterFilterDeleteModal: ({ visible, filterName, isDeleting, onContinue, onCancel }: any) =>
    visible ? (
      <div data-testid="mock-delete-modal" data-filter-name={filterName} data-deleting={String(!!isDeleting)}>
        <button data-testid="mock-delete-continue" onClick={onContinue} />
        <button data-testid="mock-delete-cancel" onClick={onCancel} />
      </div>
    ) : null,
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
  const onDelete = jest.fn();
  const onDeleteCancel = jest.fn();
  const onDeleteConfirm = jest.fn();

  const mockDeleteRasterFilter = (overrides?: Record<string, unknown>) =>
    (useDeleteRasterFilter as jest.Mock).mockReturnValue({
      filterToDelete: null,
      isDeleting: false,
      onDelete,
      onDeleteCancel,
      onDeleteConfirm,
      ...overrides,
    });

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
    mockDeleteRasterFilter();
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

    it('navigates to the edit page of the filter whose edit action is used', () => {
      render(<MapBasedFilters />);

      capturedTableProps.onEdit('lc');

      expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.FILTERS}/edit/lc`);
    });

    it('passes onDelete to the table', () => {
      render(<MapBasedFilters />);

      capturedTableProps.onDelete(mockCategories[0]);

      expect(onDelete).toHaveBeenCalledWith(mockCategories[0]);
    });
  });

  describe('delete modal', () => {
    it('is closed while no filter is picked for deletion', () => {
      render(<MapBasedFilters />);

      expect(screen.queryByTestId('mock-delete-modal')).not.toBeInTheDocument();
    });

    it('opens with the name of the filter picked for deletion', () => {
      mockDeleteRasterFilter({ filterToDelete: mockCategories[0] });
      render(<MapBasedFilters />);

      expect(screen.getByTestId('mock-delete-modal')).toHaveAttribute('data-filter-name', 'Land Cover');
    });

    it('passes isDeleting to the modal', () => {
      mockDeleteRasterFilter({ filterToDelete: mockCategories[0], isDeleting: true });
      render(<MapBasedFilters />);

      expect(screen.getByTestId('mock-delete-modal')).toHaveAttribute('data-deleting', 'true');
    });

    it('confirms and cancels through the delete hook', () => {
      mockDeleteRasterFilter({ filterToDelete: mockCategories[0] });
      render(<MapBasedFilters />);

      fireEvent.click(screen.getByTestId('mock-delete-continue'));
      fireEvent.click(screen.getByTestId('mock-delete-cancel'));

      expect(onDeleteConfirm).toHaveBeenCalledTimes(1);
      expect(onDeleteCancel).toHaveBeenCalledTimes(1);
    });
  });
});
