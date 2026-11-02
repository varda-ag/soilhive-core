import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropdown } from 'components/UI/Dropdown/Dropdown';

jest.mock('components/UI/FormFieldWrapper/FormFieldWrapper', () => ({
  FormFieldWrapper: ({ children, className }: any) => (
    <div data-testid="mock-wrapper" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('components/UI/Menu/Menu', () => ({
  Menu: ({ options, onSelect, isMultiselect, selectedOptions }: any) => {
    const [selected, setSelected] = useState<string[]>(selectedOptions || []);
    const handleSelect = (code: string) => {
      if (isMultiselect) {
        const newValue = selected.includes(code) ? [...selected.filter(selectedCode => code !== selectedCode)] : [...selected, code];
        setSelected(newValue);
        onSelect(newValue);
        return;
      }

      // As the real Menu: one selected code is a list of one.
      onSelect([code]);
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

  describe('searchable', () => {
    const SOIL_PROPERTIES = [
      { code: 'clay', name: 'Clay' },
      { code: 'soc', name: 'Organic carbon' },
      { code: 'carbonates', name: 'Carbonates' },
      { code: 'ph', name: 'pH' },
    ];

    const renderSearchable = (props: Partial<Parameters<typeof Dropdown>[0]> = {}) => {
      const handleChange = jest.fn();
      const utils = render(
        <Dropdown
          options={SOIL_PROPERTIES}
          name="field"
          placeholder="Pick"
          noMatchesMessage="No matches"
          isSearchable
          onChange={handleChange}
          {...props}
        />,
      );
      return { ...utils, handleChange, field: screen.getByRole('combobox') as HTMLInputElement };
    };

    const shownNames = () => screen.queryAllByTestId(/^mock-option-/).map(option => option.textContent);

    it('shows the selected option in a text field, and the placeholder without one', () => {
      const { field, rerender } = renderSearchable({ value: 'soc' });

      expect(field).toHaveValue('Organic carbon');

      rerender(<Dropdown options={SOIL_PROPERTIES} placeholder="Pick" isSearchable onChange={jest.fn()} />);
      expect(field).toHaveValue('');
      expect(field).toHaveAttribute('placeholder', 'Pick');
    });

    it('opens on focus with every option, and shows the selected option in place of the typed text', () => {
      const { field } = renderSearchable({ value: 'soc' });

      fireEvent.focus(field);

      expect(shownNames()).toEqual(['Clay', 'Organic carbon', 'Carbonates', 'pH']);
      expect(field).toHaveValue('');
      expect(field).toHaveAttribute('placeholder', 'Organic carbon');
      expect(field).toHaveAttribute('aria-expanded', 'true');
    });

    it('lists only the options whose name has the typed text, in any case', () => {
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: ' CARB ' } });

      expect(shownNames()).toEqual(['Organic carbon', 'Carbonates']);
    });

    it('lists every option again once the typed text is deleted', () => {
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'carb' } });
      fireEvent.change(field, { target: { value: '' } });

      expect(shownNames()).toEqual(['Clay', 'Organic carbon', 'Carbonates', 'pH']);
    });

    it('shows the no-matches message while no option matches', () => {
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'zinc' } });

      expect(shownNames()).toEqual([]);
      expect(screen.getByText('No matches')).toBeInTheDocument();
    });

    it('picks an option clicked in the filtered menu', () => {
      const { field, handleChange } = renderSearchable({ value: 'clay' });

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'carb' } });
      fireEvent.click(screen.getByTestId('mock-option-carbonates'));
      fireEvent.blur(field);

      expect(handleChange).toHaveBeenCalledWith('carbonates', 'field');
      expect(screen.queryByTestId('mock-menu')).toBeNull();
      expect(field).toHaveValue('Carbonates');
    });

    it('picks the first enabled option the typed text shows on Enter', () => {
      const { field, handleChange } = renderSearchable({
        options: [{ code: 'soc', name: 'Organic carbon', isDisabled: true }, ...SOIL_PROPERTIES.filter(({ code }) => code !== 'soc')],
      });

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'carb' } });
      fireEvent.keyDown(field, { key: 'Enter' });

      expect(handleChange).toHaveBeenCalledWith('carbonates', 'field');
      expect(screen.queryByTestId('mock-menu')).toBeNull();
      // Still focused: the field is empty for a new search, and shows the new selection in its place.
      expect(field).toHaveValue('');
      expect(field).toHaveAttribute('placeholder', 'Carbonates');
    });

    it('picks nothing on Enter before a text is typed, or while nothing matches', () => {
      const { field, handleChange } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.keyDown(field, { key: 'Enter' });
      fireEvent.change(field, { target: { value: 'zinc' } });
      fireEvent.keyDown(field, { key: 'Enter' });

      expect(handleChange).not.toHaveBeenCalled();
    });

    it('closes on Escape and drops the typed text, without a change', () => {
      const { field, handleChange } = renderSearchable({ value: 'ph' });

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'carb' } });
      fireEvent.keyDown(field, { key: 'Escape' });

      expect(screen.queryByTestId('mock-menu')).toBeNull();
      expect(field).toHaveValue('');
      expect(handleChange).not.toHaveBeenCalled();

      fireEvent.blur(field);
      expect(field).toHaveValue('pH');
    });

    it('keeps Escape from the elements around the field only while the menu is open', () => {
      const onDocumentKeyDown = jest.fn();
      document.addEventListener('keydown', onDocumentKeyDown);
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.keyDown(field, { key: 'Escape' });
      expect(onDocumentKeyDown).not.toHaveBeenCalled();

      fireEvent.keyDown(field, { key: 'Escape' });
      expect(onDocumentKeyDown).toHaveBeenCalledTimes(1);
      document.removeEventListener('keydown', onDocumentKeyDown);
    });

    it('opens again on typing or ArrowDown once closed', () => {
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.keyDown(field, { key: 'Escape' });
      fireEvent.keyDown(field, { key: 'ArrowDown' });
      expect(screen.getByTestId('mock-menu')).toBeInTheDocument();

      fireEvent.keyDown(field, { key: 'Escape' });
      fireEvent.change(field, { target: { value: 'cl' } });
      expect(shownNames()).toEqual(['Clay']);
    });

    it('closes on Tab and on a click outside, and drops the typed text', () => {
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'carb' } });
      fireEvent.keyDown(field, { key: 'Tab' });
      expect(screen.queryByTestId('mock-menu')).toBeNull();

      fireEvent.change(field, { target: { value: 'carb' } });
      fireEvent.click(document.body);
      expect(screen.queryByTestId('mock-menu')).toBeNull();
      expect(field).toHaveValue('');
    });

    it('closes the open menu on a click on the arrow', () => {
      const { field } = renderSearchable();

      fireEvent.focus(field);
      fireEvent.click(screen.getByTestId('svg-icon-mock'));

      expect(screen.queryByTestId('mock-menu')).toBeNull();
    });

    it('does not open when disabled or read-only', () => {
      const { field, rerender } = renderSearchable({ isDisabled: true });

      expect(field).toBeDisabled();
      fireEvent.click(field);
      expect(screen.queryByTestId('mock-menu')).toBeNull();

      rerender(<Dropdown options={SOIL_PROPERTIES} isReadOnly isSearchable onChange={jest.fn()} />);
      fireEvent.focus(field);
      fireEvent.click(field);
      expect(screen.queryByTestId('mock-menu')).toBeNull();
    });
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
