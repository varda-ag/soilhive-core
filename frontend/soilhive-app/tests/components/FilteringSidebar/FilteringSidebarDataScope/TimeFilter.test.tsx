import { render, screen, fireEvent } from '@testing-library/react';
import { TimeFilter } from 'components/FilteringSidebar/FilteringSidebarDataScope/TimeFilter/TimeFilter';

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
  it('renders with initialState and Apply is disabled initially', () => {
    const { container } = render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={jest.fn()} />);

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1990-2000');

    const applyBtn = screen.getByTestId('mock-button-apply') as HTMLButtonElement;
    expect(applyBtn).toBeDisabled();
    expect(container).toMatchSnapshot();
  });

  it('uses defaults when initialState has no min/max', () => {
    render(<TimeFilter initialState={{}} onChange={jest.fn()} />);

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1964-2022');
  });

  it('enables Apply after slider change', () => {
    render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={jest.fn()} />);

    const applyBtn = screen.getByTestId('mock-button-apply') as HTMLButtonElement;
    expect(applyBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId('mock-slider-change'));

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('2000-2010');
    expect(applyBtn).not.toBeDisabled();
  });

  it('calls onChange with selectedTime on Apply and disables Apply again', () => {
    const onChange = jest.fn();

    render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('mock-slider-change'));

    const applyBtn = screen.getByTestId('mock-button-apply') as HTMLButtonElement;
    expect(applyBtn).not.toBeDisabled();

    fireEvent.click(applyBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ min: 2000, max: 2010 });

    expect(applyBtn).toBeDisabled();
  });

  it('Cancel resets to initialState and disables Apply', () => {
    render(<TimeFilter initialState={{ min: 1990, max: 2000 }} onChange={jest.fn()} />);

    fireEvent.click(screen.getByTestId('mock-slider-change'));

    const applyBtn = screen.getByTestId('mock-button-apply') as HTMLButtonElement;
    expect(applyBtn).not.toBeDisabled();
    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('2000-2010');

    fireEvent.click(screen.getByTestId('mock-button-cancel'));

    expect(screen.getByTestId('mock-slider-values')).toHaveTextContent('1990-2000');
    expect(applyBtn).toBeDisabled();
  });
});
