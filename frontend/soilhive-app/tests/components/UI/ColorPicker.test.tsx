import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPicker } from 'components/UI/ColorPicker/ColorPicker';

describe('ColorPicker component', () => {
  it('renders with default props', () => {
    const { container } = render(<ColorPicker name="primary" onChange={() => {}} />);

    const wrapper = screen.getByTestId('sh-colorpicker');
    const input = screen.getByTestId('sh-colorpicker-input');

    expect(wrapper).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'color');
    expect(container).toMatchSnapshot();
  });

  it('uses initialValue on mount', () => {
    render(
      <ColorPicker
        name="accent"
        initialValue="#ff0000"
        onChange={() => {}}
      />
    );

    const input = screen.getByTestId('sh-colorpicker-input');
    expect(input).toHaveValue('#ff0000');

    const wrapper = screen.getByTestId('sh-colorpicker');
    expect(wrapper).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('calls onChange when the value changes', () => {
    const handleChange = jest.fn();

    render(
      <ColorPicker
        name="accent"
        initialValue="#123456"
        onChange={handleChange}
      />
    );

    const input = screen.getByTestId('sh-colorpicker-input');

    fireEvent.change(input, { target: { value: '#abcdef' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('#abcdef', 'accent');
  });

  it('updates internal state when initialValue changes from props', () => {
    const { rerender } = render(
      <ColorPicker
        name="primary"
        initialValue="#111111"
        onChange={() => {}}
      />
    );

    const input = screen.getByTestId('sh-colorpicker-input');
    expect(input).toHaveValue('#111111');

    rerender(
      <ColorPicker
        name="primary"
        initialValue="#222222"
        onChange={() => {}}
      />
    );

    expect(input).toHaveValue('#222222');
  });

  it('accepts custom className', () => {
    render(
      <ColorPicker
        name="custom"
        className="my-custom-class"
        onChange={() => {}}
      />
    );

    const wrapper = screen.getByTestId('sh-colorpicker');
    expect(wrapper).toHaveClass('my-custom-class');
  });
});
