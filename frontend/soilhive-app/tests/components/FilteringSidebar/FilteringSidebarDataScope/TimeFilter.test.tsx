import { render, screen, fireEvent } from '@testing-library/react';
import { TimeFilter } from 'components/FilteringSidebar/FilteringSidebarDataScope/TimeFilter/TimeFilter';
import useAvailability from 'hooks/useAvailability';

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

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('TimeFilter', () => {
  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      timeFilterRange: {
        min: 1964,
        max: 2022,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with initialState', () => {
    const { container } = render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={jest.fn()} />);

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1990-2000');
    expect(container).toMatchSnapshot();
  });

  it('does not render timerange values equal zero', () => {
    (useAvailability as jest.Mock).mockReturnValue({
      timeFilterRange: {
        min: 0,
        max: 0,
      },
    });
    render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={jest.fn()} />);

    expect(screen.queryByTestId('mock-slider-values')).not.toBeInTheDocument();
  });

  it('uses defaults when initialState has no min/max', () => {
    render(<TimeFilter initialState={{}} onChange={jest.fn()} />);

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1964-2022');
  });

  it('calls onChange with selectedTime on Apply and disables Apply again', () => {
    const onChange = jest.fn();

    render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('mock-slider-change'));

    const applyBtn = screen.getByTestId('mock-button-apply') as HTMLButtonElement;

    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ min: 2000, max: 2010 });
  });

  it('Cancel resets to initialState and disables Apply', () => {
    render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={jest.fn()} />);

    fireEvent.click(screen.getByTestId('mock-slider-change'));

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('2000-2010');

    fireEvent.click(screen.getByTestId('mock-button-cancel'));

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1990-2000');
  });
});
