import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropdown } from 'components/UI/Dropdown/Dropdown';

jest.mock('components/UI', () => ({
  FormFieldWrapper: ({ children, ...rest }: any) => (
    <div data-testid="mock-wrapper" {...rest}>
      {children}
    </div>
  ),
  Menu: ({ options, onSelect, isMultiselect, selectedOptions }: any) => {
    const [selected, setSelected] = useState<string[]>(selectedOptions || []);
    const handleSelect = (code: string) => {
      if (isMultiselect) {
        const newValue = selected.includes(code) ? [...selected.filter(selectedCode => code !== selectedCode)] : [...selected, code];
        setSelected(newValue);
        onSelect(newValue);
        return;
      }

      onSelect(code);
    };
    return (
      <div data-testid="mock-menu">
        {options.map((o: any) => (
          <div key={o.code} data-testid={`mock-option-${o.code}`} onClick={() => handleSelect(o.code)}>
            {o.name}
          </div>
        ))}
      </div>
    );
  },
}));

const OPTIONS = [
  { code: 'a', name: 'Option A' },
  { code: 'b', name: 'Option B' },
];

describe('Dropdown component', () => {
  it('renders dropdown and placeholder', () => {
    render(<Dropdown options={OPTIONS} placeholder="Select something" onChange={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Select something')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    render(<Dropdown options={OPTIONS} placeholder="Pick" onChange={jest.fn()} />);

    const input = screen.getByText('Pick');
    fireEvent.click(input);

    expect(screen.getByTestId('mock-menu')).toBeInTheDocument();
    expect(screen.getByTestId('svg-icon-mock')).toBeInTheDocument();
  });

  it('closes dropdown after selecting an option and calls onChange', () => {
    const handleChange = jest.fn();

    render(<Dropdown options={OPTIONS} placeholder="Pick" name="field" onChange={handleChange} />);

    fireEvent.click(screen.getByText('Pick'));

    const optionA = screen.getByTestId('mock-option-a');
    fireEvent.click(optionA);

    expect(handleChange).toHaveBeenCalledWith('a', 'field');
    expect(screen.queryByTestId('mock-menu')).toBeNull();
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('supports multiselect', () => {
    const handleChange = jest.fn();

    render(<Dropdown options={OPTIONS} placeholder="Pick" name="field" value={[]} onChange={handleChange} isMultiselect />);

    fireEvent.click(screen.getByText('Pick'));

    fireEvent.click(screen.getByTestId('mock-option-a'));
    fireEvent.click(screen.getByTestId('mock-option-b'));

    expect(handleChange).toHaveBeenCalledWith(['a', 'b'], 'field');
    expect(screen.queryByTestId('mock-menu')).toBeInTheDocument();
    expect(screen.getByText('Option A, Option B')).toBeInTheDocument();
  });

  it('shows predefined multiselect value', () => {
    const handleChange = jest.fn();

    render(<Dropdown options={OPTIONS} placeholder="Pick" name="field" value={['a', 'b']} onChange={handleChange} isMultiselect />);

    expect(screen.getByText('Option A, Option B')).toBeInTheDocument();
  });

  it('shows selected option when value prop is passed', () => {
    render(<Dropdown options={OPTIONS} value="b" onChange={jest.fn()} />);

    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('updates internal state when value prop changes', () => {
    const { rerender } = render(<Dropdown options={OPTIONS} value="a" onChange={jest.fn()} />);

    expect(screen.getByText('Option A')).toBeInTheDocument();

    rerender(<Dropdown options={OPTIONS} value="b" onChange={jest.fn()} />);

    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('does not open when disabled', () => {
    render(<Dropdown options={OPTIONS} isDisabled placeholder="Pick" onChange={jest.fn()} />);

    fireEvent.click(screen.getByText('Pick'));
    expect(screen.queryByTestId('mock-menu')).toBeNull();
  });

  it('does not open when read-only', () => {
    render(<Dropdown options={OPTIONS} isReadOnly placeholder="Pick" onChange={jest.fn()} />);

    fireEvent.click(screen.getByText('Pick'));
    expect(screen.queryByTestId('mock-menu')).toBeNull();
  });

  it('closes when clicking outside', () => {
    const { container } = render(
      <>
        <div id="test-out" />
        <Dropdown options={OPTIONS} placeholder="Pick" onChange={jest.fn()} />
      </>,
    );

    fireEvent.click(screen.getByText('Pick'));
    expect(screen.getByTestId('mock-menu')).toBeInTheDocument();

    const out = container.querySelector('#test-out');
    fireEvent.click(out as Element);
    expect(screen.queryByTestId('mock-menu')).toBeNull();
  });

  it('applies error state', () => {
    render(<Dropdown options={OPTIONS} isError onChange={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-dropdown')).toHaveClass('Invalid');
  });

  it('supports custom className & inputClassName', () => {
    render(<Dropdown options={OPTIONS} className="outer-class" inputClassName="inner-class" onChange={jest.fn()} />);

    const wrapper = screen.getByTestId('mock-wrapper');
    const dropdown = screen.getByTestId('sh-ui-dropdown');

    expect(wrapper).toHaveClass('outer-class');
    expect(dropdown).toHaveClass('inner-class');
  });

  it('matches snapshot', () => {
    const { container } = render(
      <Dropdown
        label="Label"
        options={OPTIONS}
        value="a"
        isError
        helperMessage="Helpful"
        errorMessage="Error"
        showSelectedCheckIcon
        onChange={jest.fn()}
      />,
    );

    expect(container).toMatchSnapshot();
  });
});
