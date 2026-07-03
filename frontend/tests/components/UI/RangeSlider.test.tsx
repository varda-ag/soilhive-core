import { fireEvent, render, screen } from '@testing-library/react';
import { RangeSlider } from 'components/UI/RangeSlider/RangeSlider';

describe('RangeSlider', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with initial value and matches snapshot', () => {
    const { container } = render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} />);

    const input = screen.getByRole('slider') as HTMLInputElement;

    expect(input.value).toBe('5');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '10');
    expect(input).toHaveAttribute('step', '1');
    expect(container).toMatchSnapshot();
  });

  it('calls onChange when slider value changes', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7' } });

    expect(input.value).toBe('7');
    expect(mockOnChange).toHaveBeenCalledWith(7);
  });

  it('renders buttons when showButtons is true', () => {
    const { container } = render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} showButtons={true} />);

    expect(screen.getByRole('button', { name: '-' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('does not render buttons when showButtons is false', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} showButtons={false} />);

    expect(screen.queryByRole('button', { name: '-' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
  });

  it('decrease button decreases value by 1 by default', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} showButtons={true} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '-' }));

    expect(input.value).toBe('4');
    expect(mockOnChange).toHaveBeenCalledWith(4);
  });

  it('increase button increases value by 1 by default', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} showButtons={true} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '+' }));

    expect(input.value).toBe('6');
    expect(mockOnChange).toHaveBeenCalledWith(6);
  });

  it('uses custom step for buttons', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} showButtons={true} step={2} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '+' }));

    expect(input.value).toBe('7');
    expect(mockOnChange).toHaveBeenCalledWith(7);
  });

  it('does not decrease below min', () => {
    render(<RangeSlider min={0} max={10} initialValue={0} onChange={mockOnChange} showButtons={true} />);

    const decreaseButton = screen.getByRole('button', { name: '-' });
    const input = screen.getByRole('slider') as HTMLInputElement;

    expect(decreaseButton).toBeDisabled();

    fireEvent.click(decreaseButton);

    expect(input.value).toBe('0');
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('does not increase above max', () => {
    render(<RangeSlider min={0} max={10} initialValue={10} onChange={mockOnChange} showButtons={true} />);

    const increaseButton = screen.getByRole('button', { name: '+' });
    const input = screen.getByRole('slider') as HTMLInputElement;

    expect(increaseButton).toBeDisabled();

    fireEvent.click(increaseButton);

    expect(input.value).toBe('10');
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('clamps decrease to min', () => {
    render(<RangeSlider min={0} max={10} initialValue={1} step={5} onChange={mockOnChange} showButtons={true} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '-' }));

    expect(input.value).toBe('0');
    expect(mockOnChange).toHaveBeenCalledWith(0);
  });

  it('clamps increase to max', () => {
    render(<RangeSlider min={0} max={10} initialValue={9} step={5} onChange={mockOnChange} showButtons={true} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: '+' }));

    expect(input.value).toBe('10');
    expect(mockOnChange).toHaveBeenCalledWith(10);
  });

  it('applies the Medium class by default', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} />);
    expect(screen.getByTestId('sh-ui-range')).toHaveClass('Medium');
  });

  it('applies the Small class when size is small', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} size="small" />);
    expect(screen.getByTestId('sh-ui-range')).toHaveClass('Small');
  });

  it('applies the Tiny class when size is tiny', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} size="tiny" />);
    expect(screen.getByTestId('sh-ui-range')).toHaveClass('Tiny');
  });

  it('disables input when disabled prop is true', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} disabled={true} />);
    const input = screen.getByRole('slider') as HTMLInputElement;

    expect(input).toBeDisabled();
  });

  it('updates selected value when initialValue prop changes', () => {
    const { rerender } = render(<RangeSlider min={0} max={10} initialValue={3} onChange={mockOnChange} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    expect(input.value).toBe('3');

    rerender(<RangeSlider min={0} max={10} initialValue={8} onChange={mockOnChange} />);

    expect(input.value).toBe('8');
  });

  it('updates range width style based on selected value', () => {
    render(<RangeSlider min={0} max={10} initialValue={5} onChange={mockOnChange} />);

    const input = screen.getByRole('slider') as HTMLInputElement;
    const range = screen.getByTestId('sh-ui-range-filled') as HTMLDivElement;
    expect(range).toHaveStyle({ width: '50%' });

    fireEvent.change(input, { target: { value: '8' } });

    expect(range).toHaveStyle({ width: '80%' });
  });
});
