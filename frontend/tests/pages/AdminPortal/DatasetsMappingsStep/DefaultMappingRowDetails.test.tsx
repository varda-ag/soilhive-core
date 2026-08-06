import { render, screen } from '@testing-library/react';
import { DefaultMappingRowDetails } from 'pages/AdminPortal/DatasetsMappingsStep/DefaultMappingRowDetails';
import type { DetailOptionMap, RowDetails } from 'hooks/useMappingsStep';

// AutocompleteDropdown wraps PrimeReact's AutoComplete — stub it so these tests
// stay focused on DefaultMappingRowDetails logic and don't pull in PrimeReact internals.
jest.mock('components/AutocompleteDropdown/AutocompleteDropdown', () => {
  const Mock = ({
    label,
    value,
    onChange,
    onClear,
  }: {
    label?: string;
    value?: string;
    onChange: (value: string) => void;
    onClear: () => void;
  }) => (
    <div data-testid="sh-autocomplete-dropdown" data-label={label} data-value={value ?? ''}>
      <button data-testid={`sh-change-${label}`} onClick={() => onChange('new-value')} />
      <button data-testid={`sh-clear-${label}`} onClick={onClear} />
    </div>
  );
  Mock.displayName = 'AutocompleteDropdown';
  return { AutocompleteDropdown: Mock };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DETAILS: RowDetails = {
  samplePretreatment: null,
  technique: null,
  laboratoryMethod: null,
  extractantConcentration: null,
  extractionRatio: null,
  extractionBase: null,
  measurementProcedure: null,
  limitOfDetection: null,
};

const DETAIL_OPTIONS: DetailOptionMap = {
  samplePretreatment: [],
  technique: [],
  laboratoryMethod: [],
  extractantConcentration: [],
  extractionRatio: [],
  extractionBase: [],
  measurementProcedure: [],
  limitOfDetection: [],
};

function defaultProps(overrides?: Partial<RowDetails>) {
  return {
    columnName: 'Carbon_organic',
    details: { ...EMPTY_DETAILS, ...overrides },
    detailOptions: DETAIL_OPTIONS,
    onDetailChange: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultMappingRowDetails', () => {
  it('renders the details panel', () => {
    render(<DefaultMappingRowDetails {...defaultProps()} />);
    expect(screen.getByTestId('sh-mapping-row-details')).toBeInTheDocument();
  });

  it('renders one dropdown per detail field', () => {
    render(<DefaultMappingRowDetails {...defaultProps()} />);
    expect(screen.getAllByTestId('sh-autocomplete-dropdown')).toHaveLength(8);
  });

  it('calls onDetailChange with the column name, field, and new value when a dropdown changes', () => {
    const props = defaultProps();
    render(<DefaultMappingRowDetails {...props} />);
    screen.getByTestId('sh-change-Technique').click();
    expect(props.onDetailChange).toHaveBeenCalledWith('Carbon_organic', 'technique', 'new-value');
  });

  it('calls onDetailChange with an empty value when a dropdown is cleared', () => {
    const props = defaultProps();
    render(<DefaultMappingRowDetails {...props} />);
    screen.getByTestId('sh-clear-Technique').click();
    expect(props.onDetailChange).toHaveBeenCalledWith('Carbon_organic', 'technique', '');
  });
});
