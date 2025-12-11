import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeColorField } from 'components/ThemeConfig/ThemeColorField';

jest.mock('components/UI', () => ({
  ColorPicker: ({ initialValue, onChange }: any) => (
    <input data-testid="mock-colorpicker" type="color" defaultValue={initialValue} onChange={e => onChange(e.target.value)} />
  ),

  TextInput: ({ label, value, onChange }: any) => (
    <input data-testid="mock-textinput" placeholder={label} defaultValue={value} onChange={e => onChange(e.target.value)} />
  ),
}));

describe('ThemeColorField component', () => {
  const onChange = jest.fn();

  beforeEach(() => {
    onChange.mockClear();
  });

  it('renders correctly', () => {
    const { container } = render(<ThemeColorField label="Primary Color" name="primary" initialValue="#123456" onChange={onChange} />);

    expect(screen.getByTestId('sh-theme-color-field')).toBeInTheDocument();
    expect(screen.getByTestId('mock-colorpicker')).toBeInTheDocument();
    expect(screen.getByTestId('mock-textinput')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('passes initialValue to children', () => {
    render(<ThemeColorField label="Primary Color" name="primary" initialValue="#abcdef" onChange={onChange} />);

    expect(screen.getByTestId('mock-colorpicker')).toHaveValue('#abcdef');
    expect(screen.getByTestId('mock-textinput')).toHaveValue('#abcdef');
  });

  it('calls onChange when ColorPicker changes value', () => {
    render(<ThemeColorField label="Primary Color" name="primary" initialValue="#000000" onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mock-colorpicker'), {
      target: { value: '#ff0000' },
    });

    expect(onChange).toHaveBeenCalledWith('primary', '#ff0000');
  });

  it('calls onChange when TextInput changes value', () => {
    render(<ThemeColorField label="Primary Color" name="primary" initialValue="#111111" onChange={onChange} />);

    fireEvent.change(screen.getByTestId('mock-textinput'), {
      target: { value: '#222222' },
    });

    expect(onChange).toHaveBeenCalledWith('primary', '#222222');
  });

  it('applies custom className', () => {
    const { container } = render(<ThemeColorField className="custom-class" label="Color" name="base" onChange={onChange} />);

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
