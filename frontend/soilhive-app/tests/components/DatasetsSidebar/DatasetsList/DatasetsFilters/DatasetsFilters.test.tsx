import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsFilters } from 'components/DatasetsSidebar/DatasetsList/DatasetsFilters/DatasetsFilters';

jest.mock('components/UI', () => ({
  __esModule: true,
  TextInput: ({ value, onChange, placeholder }: any) => (
    <input data-testid="mock-textinput" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  ),
  Button: ({ children, onClick }: any) => (
    <button data-testid="mock-button" onClick={onClick}>
      {children}
    </button>
  ),
  Dropdown: ({ name, value, onChange, options, label, isMultiselect }: any) => {
    const [selected, setSelected] = useState<string[]>(Array.isArray(value) ? value : [value]);
    const handleSelect = (selectedValue: string) => {
      if (isMultiselect) {
        const newValue = selected.includes(selectedValue)
          ? [...selected.filter(selectedCode => selectedValue !== selectedCode)]
          : [...selected, selectedValue];
        setSelected(newValue);
        onChange(newValue, name);
        return;
      }

      onChange(selectedValue, name);
    };

    return (
      <div data-testid={`mock-dropdown-${name}`}>
        <span>{label}</span>
        <div>
          {options.map((o: any) => (
            <div
              data-testid="mock-dropdown-option"
              className={value.includes(o.code) ? 'Selected' : ''}
              key={o.code}
              onClick={() => handleSelect(o.code)}
            >
              {o.name}
            </div>
          ))}
        </div>
      </div>
    );
  },
}));

describe('DatasetsFilters', () => {
  it('renders component', () => {
    const { container } = render(<DatasetsFilters />);

    expect(container).toMatchSnapshot();
  });

  it('search input updates value', () => {
    render(<DatasetsFilters />);

    const input = screen.getByTestId('mock-textinput');

    fireEvent.change(input, { target: { value: 'soil' } });
    expect(input).toHaveValue('soil');
  });

  it('clicking filter button opens and closes filter menu', () => {
    const { container } = render(<DatasetsFilters />);

    fireEvent.click(screen.getByTestId('mock-button'));
    expect(screen.getByText('Filters')).toBeInTheDocument();

    fireEvent.click(container.querySelector('.CloseIcon') as Element);
    expect(screen.queryByText('Filters')).not.toBeInTheDocument();
  });

  it('reset filters sets default values', () => {
    render(<DatasetsFilters />);

    fireEvent.click(screen.getByTestId('mock-button'));

    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    const typeSelect = screen.getByTestId('mock-dropdown-type');
    const ownershipSelect = screen.getByTestId('mock-dropdown-ownership');

    expect(typeSelect.querySelectorAll('.Selected')).toHaveLength(0);
    expect(ownershipSelect.querySelectorAll('.Selected')).toHaveLength(0);
  });

  it('dropdown changes update filter state', () => {
    render(<DatasetsFilters />);

    fireEvent.click(screen.getByTestId('mock-button'));

    const typeSelect = screen.getByTestId('mock-dropdown-type');
    fireEvent.click(typeSelect.querySelector('[data-testid="mock-dropdown-option"]') as Element);

    expect(typeSelect.querySelector('.Selected')).toBeInTheDocument();

    const ownershipSelect = screen.getByTestId('mock-dropdown-ownership');
    fireEvent.click(ownershipSelect.querySelector('[data-testid="mock-dropdown-option"]') as Element);

    expect(ownershipSelect.querySelector('.Selected')).toBeInTheDocument();
  });
});
