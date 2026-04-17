import { render, screen, fireEvent } from '@testing-library/react';
import { MappingRow } from 'pages/AdminPortal/DatasetsMappingsStep/MappingRow';
import type { ColumnMapping, DetailOptionMap } from 'hooks/useMappingsStep';

// All SVGs are globally mocked via moduleNameMapper → svgMock.tsx.
// svgMock passes through the className prop, and identity-obj-proxy returns
// each CSS module key as its literal string (e.g. styles.CheckIcon → "CheckIcon").
// We query by className to distinguish which icon is rendered.

// AutocompleteDropdown wraps PrimeReact's AutoComplete — stub it so these tests
// stay focused on MappingRow logic and don't pull in PrimeReact internals.
jest.mock('components/UI/AutocompleteDropdown/AutocompleteDropdown', () => {
  const Mock = ({ isDisabled }: { isDisabled?: boolean }) => (
    <div data-testid="sh-autocomplete-dropdown" aria-disabled={isDisabled ?? false} />
  );
  Mock.displayName = 'AutocompleteDropdown';
  return { AutocompleteDropdown: Mock };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DETAILS = {
  samplePretreatment: null,
  technique: null,
  extractantFormulation: null,
  extractantConcentration: null,
  attractionRatio: null,
  extractionBase: null,
  instrument: null,
  limitOfDetection: null,
};

const DETAIL_OPTIONS: DetailOptionMap = {
  samplePretreatment: [],
  technique: [],
  extractantFormulation: [],
  extractantConcentration: [],
  attractionRatio: [],
  extractionBase: [],
  instrument: [],
  limitOfDetection: [],
};

function unmappedMapping(overrides?: Partial<ColumnMapping>): ColumnMapping {
  return {
    columnName: 'Carbon_organic',
    conceptId: null,
    unitId: null,
    details: { ...EMPTY_DETAILS },
    ...overrides,
  };
}

function defaultProps(overrides?: Partial<ColumnMapping>) {
  return {
    mapping: unmappedMapping(overrides),
    conceptOptions: [{ code: 'ph', name: 'pH' }],
    unitOptions: [{ code: 'percent', name: '%' }],
    detailOptions: DETAIL_OPTIONS,
    isExpanded: false,
    isUnitEnabled: false,
    isDetailsEnabled: true,
    onToggle: jest.fn(),
    onConceptChange: jest.fn(),
    onUnitChange: jest.fn(),
    onDetailChange: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MappingRow', () => {
  describe('column name', () => {
    it('renders the detected column name', () => {
      render(<MappingRow {...defaultProps()} />);
      expect(screen.getByText('Carbon_organic')).toBeInTheDocument();
    });
  });

  describe('status icon', () => {
    it('shows the warning icon when the row is unmapped (conceptId is null)', () => {
      const { container } = render(<MappingRow {...defaultProps({ conceptId: null })} />);
      expect(container.querySelector('.WarningIcon')).toBeInTheDocument();
      expect(container.querySelector('.CheckIcon')).not.toBeInTheDocument();
    });

    it('shows the check icon when the row is mapped (conceptId is set)', () => {
      const { container } = render(<MappingRow {...defaultProps({ conceptId: 'ph' })} />);
      expect(container.querySelector('.CheckIcon')).toBeInTheDocument();
      expect(container.querySelector('.WarningIcon')).not.toBeInTheDocument();
    });
  });

  describe('expand / collapse', () => {
    it('calls onToggle with the column name when the chevron is clicked', () => {
      const props = defaultProps();
      render(<MappingRow {...props} />);
      fireEvent.click(screen.getByRole('button'));
      expect(props.onToggle).toHaveBeenCalledWith('Carbon_organic');
    });

    it('does not render the details panel when isExpanded is false', () => {
      render(<MappingRow {...defaultProps()} />);
      expect(screen.queryByTestId('sh-mapping-row-details')).not.toBeInTheDocument();
    });

    it('renders the details panel when isExpanded is true', () => {
      const props = { ...defaultProps(), isExpanded: true };
      render(<MappingRow {...props} />);
      expect(screen.getByTestId('sh-mapping-row-details')).toBeInTheDocument();
    });
  });

  describe('unit dropdown disabled state', () => {
    it('disables the unit dropdown when isUnitEnabled is false', () => {
      render(<MappingRow {...defaultProps()} isUnitEnabled={false} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveClass('Disabled');
    });

    it('enables the unit dropdown when isUnitEnabled is true', () => {
      render(<MappingRow {...defaultProps()} isUnitEnabled={true} />);
      expect(screen.getByTestId('sh-ui-dropdown')).not.toHaveClass('Disabled');
    });
  });
});
