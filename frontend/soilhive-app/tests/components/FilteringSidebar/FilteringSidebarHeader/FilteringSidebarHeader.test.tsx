import { fireEvent, render, screen } from '@testing-library/react';
import useAvailability from 'hooks/useAvailability';
import { FilteringSidebarHeader } from 'components/FilteringSidebar/FilteringSidebarHeader/FilteringSidebarHeader';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/FilteringSidebar/FiltersCounter/FiltersCounter', () => ({
  FiltersCounter: () => <div data-testid="mock-filters-counter">Mock FiltersCounter</div>,
}));

describe('FilteringSidebarHeader', () => {
  const mockClearAllFilters = jest.fn();

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({ isFiltersSelected: false, clearAllFilters: mockClearAllFilters });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it('renders sidebar header', () => {
    const { container } = render(<FilteringSidebarHeader onClose={() => {}} />);

    expect(screen.queryByTestId('sh-filtering-sidebar-header-clear-all')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls onClose when close icon is clicked', async () => {
    const onClose = jest.fn();

    render(<FilteringSidebarHeader onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-close-icon'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders clear all button when filters are selected', async () => {
    (useAvailability as jest.Mock).mockReturnValue({ isFiltersSelected: true, clearAllFilters: mockClearAllFilters });

    render(<FilteringSidebarHeader onClose={() => {}} />);

    expect(screen.getByTestId('sh-filtering-sidebar-header-clear-all')).toBeInTheDocument();
  });

  it('calls clearAllFilters on the clear all button click', async () => {
    (useAvailability as jest.Mock).mockReturnValue({ isFiltersSelected: true, clearAllFilters: mockClearAllFilters });

    render(<FilteringSidebarHeader onClose={() => {}} />);

    fireEvent.click(screen.getByTestId('sh-filtering-sidebar-header-clear-all'));
    expect(mockClearAllFilters).toHaveBeenCalled();
  });
});
