import { render, screen, fireEvent } from '@testing-library/react';
import { NoDataMessage } from 'components/DatasetsSidebar/DatasetsList/NoDataMessage/NoDataMessage';
import useAvailability from 'hooks/useAvailability';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('NoDataMessage', () => {
  const mockClearAllFilters = jest.fn();

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      clearAllFilters: mockClearAllFilters,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with isNoData=true', () => {
    const { container } = render(<NoDataMessage isNoData={true} isNoFilteredData={false} />);

    expect(screen.getByText('datasets_sidebar.no_data_available')).toBeInTheDocument();
    expect(screen.getByText('datasets_sidebar.no_data_in_selected_area')).toBeInTheDocument();
    expect(screen.queryByTestId('sh-dataset-sidebar-clear-all')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders with isNoFilteredData=true', () => {
    const { container } = render(<NoDataMessage isNoData={false} isNoFilteredData={true} />);

    expect(screen.getByText('datasets_sidebar.no_data_available')).toBeInTheDocument();
    expect(screen.getByTestId('sh-dataset-sidebar-clear-all')).toBeInTheDocument();
    expect(screen.getByText('datasets_sidebar.clear_all_filters')).toBeInTheDocument();
    expect(screen.getByText('datasets_sidebar.no_data_in_selected_area_due_to_filters')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders with neither isNoData nor isNoFilteredData', () => {
    const { container } = render(<NoDataMessage isNoData={false} isNoFilteredData={false} />);

    expect(screen.getByText('datasets_sidebar.no_data_available')).toBeInTheDocument();
    expect(screen.queryByText('datasets_sidebar.no_data_in_selected_area')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sh-dataset-sidebar-clear-all')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls clearAllFilters when the clear all button is clicked', () => {
    render(<NoDataMessage isNoData={false} isNoFilteredData={true} />);

    fireEvent.click(screen.getByTestId('sh-dataset-sidebar-clear-all'));

    expect(mockClearAllFilters).toHaveBeenCalledTimes(1);
  });
});
