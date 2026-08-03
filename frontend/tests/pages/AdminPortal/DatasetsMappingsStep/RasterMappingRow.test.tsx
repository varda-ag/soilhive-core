import { render, screen, fireEvent } from '@testing-library/react';
import { RasterMappingRow } from 'pages/AdminPortal/DatasetsMappingsStep/RasterMappingRow';
import type { ColumnMapping, DetailOptionMap } from 'hooks/useRasterMappingStep';

// All SVGs are globally mocked via moduleNameMapper → svgMock.tsx.
// svgMock passes through the className prop, and identity-obj-proxy returns
// each CSS module key as its literal string (e.g. styles.CheckIcon → "CheckIcon").
// We query by className to distinguish which icon is rendered.

// AutocompleteDropdown wraps PrimeReact's AutoComplete — stub it so these tests
// stay focused on RasterMappingRow logic and don't pull in PrimeReact internals.
jest.mock('components/AutocompleteDropdown/AutocompleteDropdown', () => {
  const Mock = ({ isDisabled }: { isDisabled?: boolean }) => (
    <div data-testid="sh-autocomplete-dropdown" aria-disabled={isDisabled ?? false} />
  );
  Mock.displayName = 'AutocompleteDropdown';
  return { AutocompleteDropdown: Mock };
});

// AdditionalResourcesUpload hits the /files API via useApiQueries/useRequest — stub it so these
// tests stay focused on RasterMappingRow logic and don't need a QueryClient/notifications context.
jest.mock('pages/AdminPortal/DatasetsMappingsStep/AdditionalResourcesUpload/AdditionalResourcesUpload', () => {
  const Mock = () => <div data-testid="sh-additional-resources-upload" />;
  Mock.displayName = 'AdditionalResourcesUpload';
  return { AdditionalResourcesUpload: Mock };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DETAILS = {
  laboratoryMethod: null,
};

const DETAIL_OPTIONS: DetailOptionMap = {
  laboratoryMethod: [],
};

function unmappedMapping(overrides?: Partial<ColumnMapping>): ColumnMapping {
  return {
    columnName: 'Carbon_organic',
    fileId: 'file-1',
    bandKey: 0,
    conceptId: null,
    unitId: null,
    minDepth: null,
    maxDepth: null,
    referencePeriodStart: null,
    referencePeriodStop: null,
    layerDescription: null,
    additionalResources: [],
    details: { ...EMPTY_DETAILS },
    isGeometryDetectedField: false,
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
    isGeometryDetectedField: false,
    onToggle: jest.fn(),
    onConceptChange: jest.fn(),
    onUnitChange: jest.fn(),
    onMinDepthChange: jest.fn(),
    onMaxDepthChange: jest.fn(),
    onDetailChange: jest.fn(),
    onReferencePeriodStartChange: jest.fn(),
    onReferencePeriodStopChange: jest.fn(),
    onLayerDescriptionChange: jest.fn(),
    onAdditionalResourcesChange: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RasterMappingRow', () => {
  describe('column name', () => {
    it('renders the detected column name', () => {
      render(<RasterMappingRow {...defaultProps()} />);
      expect(screen.getByText('Carbon_organic')).toBeInTheDocument();
    });

    it('sets the full column name as the title attribute for a hover tooltip', () => {
      render(<RasterMappingRow {...defaultProps({ columnName: 'Carbon_organic_content_percent_0_30cm' })} />);
      expect(screen.getByText('Carbon_organic_content_percent_0_30cm')).toHaveAttribute('title', 'Carbon_organic_content_percent_0_30cm');
    });
  });

  describe('status icon', () => {
    it('shows the warning icon when the row is unmapped (conceptId is null)', () => {
      const { container } = render(<RasterMappingRow {...defaultProps({ conceptId: null })} />);
      expect(container.querySelector('.WarningIcon')).toBeInTheDocument();
      expect(container.querySelector('.CheckIcon')).not.toBeInTheDocument();
    });

    it('shows the check icon when the row is mapped (conceptId is set)', () => {
      const { container } = render(<RasterMappingRow {...defaultProps({ conceptId: 'ph' })} />);
      expect(container.querySelector('.CheckIcon')).toBeInTheDocument();
      expect(container.querySelector('.WarningIcon')).not.toBeInTheDocument();
    });
  });

  describe('expand / collapse', () => {
    it('calls onToggle with the column name when the chevron is clicked', () => {
      const props = defaultProps();
      render(<RasterMappingRow {...props} />);
      fireEvent.click(screen.getByRole('button'));
      expect(props.onToggle).toHaveBeenCalledWith('Carbon_organic');
    });

    it('does not render the details panel when isExpanded is false', () => {
      render(<RasterMappingRow {...defaultProps()} />);
      expect(screen.queryByTestId('sh-mapping-row-details')).not.toBeInTheDocument();
    });

    it('renders the details panel when isExpanded is true', () => {
      const props = { ...defaultProps(), isExpanded: true };
      render(<RasterMappingRow {...props} />);
      expect(screen.getByTestId('sh-mapping-row-details')).toBeInTheDocument();
    });
  });

  describe('unit dropdown disabled state', () => {
    it('disables the unit dropdown when isUnitEnabled is false', () => {
      render(<RasterMappingRow {...defaultProps()} isUnitEnabled={false} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveClass('Disabled');
    });

    it('enables the unit dropdown when isUnitEnabled is true', () => {
      render(<RasterMappingRow {...defaultProps()} isUnitEnabled={true} />);
      expect(screen.getByTestId('sh-ui-dropdown')).not.toHaveClass('Disabled');
    });
  });

  describe('min-max depth inputs', () => {
    it('renders a "From" and a "To" number input', () => {
      render(<RasterMappingRow {...defaultProps()} />);
      expect(screen.getByPlaceholderText('From')).toHaveAttribute('type', 'number');
      expect(screen.getByPlaceholderText('To')).toHaveAttribute('type', 'number');
    });

    it('reflects mapping.minDepth/maxDepth as the input values', () => {
      render(<RasterMappingRow {...defaultProps({ minDepth: '10', maxDepth: '20' })} />);
      expect(screen.getByPlaceholderText('From')).toHaveValue(10);
      expect(screen.getByPlaceholderText('To')).toHaveValue(20);
    });

    it('calls onMinDepthChange with the column name and new value when "From" changes', () => {
      const props = defaultProps();
      render(<RasterMappingRow {...props} />);
      fireEvent.change(screen.getByPlaceholderText('From'), { target: { value: '5' } });
      expect(props.onMinDepthChange).toHaveBeenCalledWith('Carbon_organic', '5');
    });

    it('calls onMaxDepthChange with the column name and new value when "To" changes', () => {
      const props = defaultProps();
      render(<RasterMappingRow {...props} />);
      fireEvent.change(screen.getByPlaceholderText('To'), { target: { value: '30' } });
      expect(props.onMaxDepthChange).toHaveBeenCalledWith('Carbon_organic', '30');
    });
  });
});
