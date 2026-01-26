import { render, screen, fireEvent } from '@testing-library/react';
import { MultirangeSlider } from 'components/UI/MultirangeSlider/MultirangeSlider';

function getInputs(container: HTMLElement) {
  const ranges = Array.from(container.querySelectorAll('input[type="range"]')) as HTMLInputElement[];
  const numbers = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
  return { ranges, numbers };
}

describe('MultirangeSlider', () => {
  it('renders range inputs with predefined selectedMin/selectedMax', () => {
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={jest.fn()} />);

    const { ranges } = getInputs(container);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].value).toBe('10');
    expect(ranges[1].value).toBe('90');
    expect(screen.getByTestId('sh-ui-multirange')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls onChange when min range thumb changes', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={onChange} />);

    const { ranges } = getInputs(container);

    fireEvent.change(ranges[0], { target: { value: '20' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(20, 90);
  });

  it('clamps min range thumb to maxVal (cannot exceed current max)', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={30} onChange={onChange} />);

    const { ranges } = getInputs(container);

    fireEvent.change(ranges[0], { target: { value: '80' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(30, 30);
  });

  it('calls onChange when max range thumb changes', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={onChange} />);

    const { ranges } = getInputs(container);

    fireEvent.change(ranges[1], { target: { value: '70' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10, 70);
  });

  it('clamps max range thumb to minVal (cannot go below current min)', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={60} selectedMax={90} onChange={onChange} />);

    const { ranges } = getInputs(container);

    fireEvent.change(ranges[1], { target: { value: '10' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(60, 60);
  });

  it('calls onChange when min number input changes within valid bounds', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={onChange} />);

    const { numbers } = getInputs(container);
    expect(numbers).toHaveLength(2);

    fireEvent.change(numbers[0], { target: { value: '25' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(25, 90);
  });

  it('does NOT call onChange for min number input if value is out of bounds (> maxVal)', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={40} onChange={onChange} />);

    const { numbers } = getInputs(container);

    fireEvent.change(numbers[0], { target: { value: '70' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange when max number input changes within valid bounds', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={onChange} />);

    const { numbers } = getInputs(container);

    fireEvent.change(numbers[1], { target: { value: '95' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(10, 95);
  });

  it('does NOT call onChange for max number input if value is out of bounds (< minVal)', () => {
    const onChange = jest.fn();
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={60} selectedMax={90} onChange={onChange} />);

    const { numbers } = getInputs(container);

    fireEvent.change(numbers[1], { target: { value: '20' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('sets zIndex=5 on the min range thumb when minVal === max', () => {
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={100} selectedMax={100} onChange={jest.fn()} />);

    const minRange = container.querySelectorAll('input[type="range"]')[0] as HTMLInputElement;

    expect(minRange.style.zIndex).toBe('5');
  });

  it('syncs internal state when selectedMin/selectedMax props change', () => {
    const onChange = jest.fn();
    const { container, rerender } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={onChange} />);

    rerender(<MultirangeSlider min={0} max={100} selectedMin={20} selectedMax={80} onChange={onChange} />);

    const { ranges, numbers } = getInputs(container);

    expect(ranges[0].value).toBe('20');
    expect(ranges[1].value).toBe('80');

    expect(numbers[0].value).toBe('20');
    expect(numbers[1].value).toBe('80');
  });

  it('onBlur restores min number input value to current minVal', () => {
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={jest.fn()} />);

    const { numbers } = getInputs(container);

    fireEvent.change(numbers[0], { target: { value: '25' } });
    fireEvent.blur(numbers[0]);

    expect(numbers[0].value).toBe('25');
  });

  it('onBlur restores max number input value to current maxVal', () => {
    const { container } = render(<MultirangeSlider min={0} max={100} selectedMin={10} selectedMax={90} onChange={jest.fn()} />);

    const { numbers } = getInputs(container);

    fireEvent.change(numbers[1], { target: { value: '95' } });
    fireEvent.blur(numbers[1]);

    expect(numbers[1].value).toBe('95');
  });
});
