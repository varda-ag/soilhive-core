import { render, screen, fireEvent } from '@testing-library/react';
import { AutocompleteDropdown } from 'components/UI/AutocompleteDropdown/AutocompleteDropdown';
import type { MenuOption } from 'types/components';

jest.mock('assets/icons/small-cross-icon.svg?react', () => {
  const Mock = () => <div data-testid="sh-autocomplete-clear-icon" />;
  Mock.displayName = 'Mock';
  return Mock;
});

// Minimal AutoComplete stub: renders an <input> + a list of suggestion <div>s.
// Calling onChange simulates the user typing; completeMethod is called at the
// same time so that filteredOptions (= suggestions prop) updates in the same
// render cycle.
jest.mock('primereact/autocomplete', () => ({
  AutoComplete: ({ value, onChange, onSelect, onBlur, completeMethod, suggestions, field, placeholder, disabled }: any) => (
    <div>
      <input
        data-testid="sh-autocomplete-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled ?? false}
        onChange={e => {
          onChange?.({ value: e.target.value });
          completeMethod?.({ query: e.target.value });
        }}
        onBlur={onBlur}
      />
      {(suggestions ?? []).map((s: any, i: number) => (
        <div key={i} data-testid="sh-autocomplete-suggestion" onClick={() => onSelect?.({ value: s })}>
          {typeof s === 'string' ? s : s[field ?? 'name']}
        </div>
      ))}
    </div>
  ),
}));

const OPTIONS: MenuOption[] = [
  { code: 'p1', name: 'Carbon organic' },
  { code: 'p2', name: 'Sand Fraction' },
];

describe('AutocompleteDropdown — code/name handling', () => {
  describe('initial display', () => {
    it('shows the option name for the given code', () => {
      render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} />);
      expect(screen.getByTestId('sh-autocomplete-input')).toHaveValue('Carbon organic');
    });

    it('shows an empty string when value is undefined', () => {
      render(<AutocompleteDropdown options={OPTIONS} value={undefined} onChange={jest.fn()} />);
      expect(screen.getByTestId('sh-autocomplete-input')).toHaveValue('');
    });

    it('shows an empty string for an unrecognised code', () => {
      render(<AutocompleteDropdown options={OPTIONS} value="unknown-uuid" onChange={jest.fn()} />);
      expect(screen.getByTestId('sh-autocomplete-input')).toHaveValue('');
    });

    it('updates the display name when the value prop changes externally', () => {
      const { rerender } = render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} />);
      expect(screen.getByTestId('sh-autocomplete-input')).toHaveValue('Carbon organic');

      rerender(<AutocompleteDropdown options={OPTIONS} value="p2" onChange={jest.fn()} />);
      expect(screen.getByTestId('sh-autocomplete-input')).toHaveValue('Sand Fraction');
    });
  });

  describe('selection', () => {
    it('calls onChange with the code (not the name) when a suggestion is clicked', () => {
      const onChange = jest.fn();
      render(<AutocompleteDropdown options={OPTIONS} value={undefined} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('sh-autocomplete-input'), { target: { value: 'Car' } });
      fireEvent.click(screen.getByText('Carbon organic'));

      expect(onChange).toHaveBeenCalledWith('p1');
    });
  });

  describe('clear button (onClear)', () => {
    it('does not render the clear button when onClear is not provided', () => {
      render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    });

    it('does not render the clear button when onClear is provided but no value is selected', () => {
      render(<AutocompleteDropdown options={OPTIONS} value={undefined} onChange={jest.fn()} onClear={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    });

    it('renders the clear button when onClear is provided and a value is selected', () => {
      render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} onClear={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    });

    it('calls onClear when the clear button is clicked', () => {
      const onClear = jest.fn();
      render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} onClear={onClear} />);
      fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
      expect(onClear).toHaveBeenCalled();
    });

    it('hides the clear button after the parent clears the value', () => {
      const { rerender } = render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} onClear={jest.fn()} />);
      rerender(<AutocompleteDropdown options={OPTIONS} value={undefined} onChange={jest.fn()} onClear={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    });
  });

  describe('blur validation', () => {
    it('resets to the last committed name when blurring with unrecognised text', () => {
      render(<AutocompleteDropdown options={OPTIONS} value="p1" onChange={jest.fn()} />);
      const input = screen.getByTestId('sh-autocomplete-input');

      fireEvent.change(input, { target: { value: 'xyz' } });
      expect(input).toHaveValue('xyz');

      fireEvent.blur(input);
      expect(input).toHaveValue('Carbon organic');
    });

    it('calls onChange with the code when blurring with an exact name match', () => {
      const onChange = jest.fn();
      render(<AutocompleteDropdown options={OPTIONS} value={undefined} onChange={onChange} />);
      const input = screen.getByTestId('sh-autocomplete-input');

      fireEvent.change(input, { target: { value: 'Carbon organic' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith('p1');
    });

    it('name match on blur is case-insensitive', () => {
      const onChange = jest.fn();
      render(<AutocompleteDropdown options={OPTIONS} value={undefined} onChange={onChange} />);
      const input = screen.getByTestId('sh-autocomplete-input');

      fireEvent.change(input, { target: { value: 'carbon ORGANIC' } });
      fireEvent.blur(input);

      expect(onChange).toHaveBeenCalledWith('p1');
    });
  });
});
