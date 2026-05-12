import { render, screen, fireEvent } from '@testing-library/react';
import { TimeFilter } from 'components/FilteringSidebar/FilteringSidebarDataScope/TimeFilter/TimeFilter';
import useDataScopeFilters from 'hooks/useDataScopeFilters';

jest.mock('hooks/useDataScopeFilters', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/UI', () => ({
  __esModule: true,

  Button: ({ children, onClick, isDisabled, ...rest }: any) => (
    <button type="button" data-testid={`mock-button-${String(children).toLowerCase()}`} disabled={!!isDisabled} onClick={onClick} {...rest}>
      {children}
    </button>
  ),

  MultirangeSlider: ({ selectedMin, selectedMax, onChange }: any) => (
    <div data-testid="mock-slider">
      <div data-testid="mock-slider-values">
        {selectedMin}-{selectedMax}
      </div>

      <button type="button" data-testid="mock-slider-change" onClick={() => onChange(2000, 2010)}>
        change
      </button>
    </div>
  ),
}));

describe('TimeFilter', () => {
  const mockHandleTimeFilterChange = jest.fn();
  const defaultHookValue = {
    timeFilterRange: {
      min: 1964,
      max: 2022,
    },
    selectedTimeFilter: {},
    handleTimeFilterChange: mockHandleTimeFilterChange,
  };
  beforeEach(() => {
    (useDataScopeFilters as jest.Mock).mockReturnValue(defaultHookValue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default timeFilterRange if time filter is not selected', () => {
    const { container } = render(<TimeFilter />);

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1964-2022');
    expect(container).toMatchSnapshot();
  });

  it('renders with default selected time filter range', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValue({ ...defaultHookValue, selectedTimeFilter: { min: 1990, max: 2010 } });
    const { container } = render(<TimeFilter />);

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1990-2010');
    expect(container).toMatchSnapshot();
  });

  it('does not render timerange values equal zero', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValue({
      ...defaultHookValue,
      timeFilterRange: {
        min: 0,
        max: 0,
      },
    });
    render(<TimeFilter />);

    expect(screen.queryByTestId('mock-slider-values')).not.toBeInTheDocument();
  });

  it('calls onChange with selectedTime on Apply button click', () => {
    render(<TimeFilter />);

    const applyBtn = screen.getByTestId('mock-button-apply') as HTMLButtonElement;

    fireEvent.click(applyBtn);

    expect(mockHandleTimeFilterChange).toHaveBeenCalledTimes(1);
    expect(mockHandleTimeFilterChange).toHaveBeenCalledWith({ min: 1964, max: 2022 });
  });

  it('Cancel resets to initialState and disables Apply', () => {
    render(<TimeFilter />);

    fireEvent.click(screen.getByTestId('mock-slider-change'));

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('2000-2010');

    fireEvent.click(screen.getByTestId('mock-button-cancel'));

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1964-2022');
  });
});
