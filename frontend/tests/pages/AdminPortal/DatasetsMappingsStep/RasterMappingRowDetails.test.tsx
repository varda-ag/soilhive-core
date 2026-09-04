import { render, screen, fireEvent } from '@testing-library/react';
import { RasterMappingRowDetails } from 'pages/AdminPortal/DatasetsMappingsStep/RasterMappingRowDetails';
import type { DetailOptionMap, RowDetails } from 'hooks/useRasterMappingStep';

// AutocompleteDropdown wraps PrimeReact's AutoComplete — stub it so these tests
// stay focused on RasterMappingRowDetails logic and don't pull in PrimeReact internals.
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

// AdditionalResourcesUpload hits the /files API via useApiQueries/useRequest — stub it so these
// tests stay focused on RasterMappingRowDetails logic and don't need a QueryClient/notifications context.
jest.mock('pages/AdminPortal/DatasetsMappingsStep/AdditionalResourcesUpload/AdditionalResourcesUpload', () => {
  const Mock = () => <div data-testid="sh-additional-resources-upload" />;
  Mock.displayName = 'AdditionalResourcesUpload';
  return { AdditionalResourcesUpload: Mock };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DETAILS: RowDetails = {
  laboratoryMethod: null,
};

const DETAIL_OPTIONS: DetailOptionMap = {
  laboratoryMethod: [],
};

function defaultProps(overrides?: {
  details?: Partial<RowDetails>;
  referencePeriodStart?: string | null;
  referencePeriodStop?: string | null;
  referencePeriodErrors?: { start: boolean; stop: boolean };
  layerDescription?: string | null;
}) {
  return {
    columnName: 'Carbon_organic',
    details: { ...EMPTY_DETAILS, ...overrides?.details },
    detailOptions: DETAIL_OPTIONS,
    referencePeriodStart: overrides?.referencePeriodStart ?? null,
    referencePeriodStop: overrides?.referencePeriodStop ?? null,
    referencePeriodErrors: overrides?.referencePeriodErrors ?? { start: false, stop: false },
    layerDescription: overrides?.layerDescription ?? null,
    additionalResources: [],
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

describe('RasterMappingRowDetails', () => {
  it('renders the details panel', () => {
    render(<RasterMappingRowDetails {...defaultProps()} />);
    expect(screen.getByTestId('sh-mapping-row-details')).toBeInTheDocument();
  });

  it('renders the laboratory method dropdown', () => {
    render(<RasterMappingRowDetails {...defaultProps()} />);
    expect(screen.getAllByTestId('sh-autocomplete-dropdown')).toHaveLength(1);
  });

  it('calls onDetailChange with the column name, field, and new value when the dropdown changes', () => {
    const props = defaultProps();
    render(<RasterMappingRowDetails {...props} />);
    screen.getByTestId('sh-change-Laboratory method').click();
    expect(props.onDetailChange).toHaveBeenCalledWith('Carbon_organic', 'laboratoryMethod', 'new-value');
  });

  it('calls onDetailChange with an empty value when the dropdown is cleared', () => {
    const props = defaultProps();
    render(<RasterMappingRowDetails {...props} />);
    screen.getByTestId('sh-clear-Laboratory method').click();
    expect(props.onDetailChange).toHaveBeenCalledWith('Carbon_organic', 'laboratoryMethod', '');
  });

  describe('reference period inputs', () => {
    it('reflects referencePeriodStart/referencePeriodStop as the input values', () => {
      render(<RasterMappingRowDetails {...defaultProps({ referencePeriodStart: '1977', referencePeriodStop: '2015' })} />);
      expect(screen.getByPlaceholderText('i.e. 1977')).toHaveValue(1977);
      expect(screen.getByPlaceholderText('i.e. 2015')).toHaveValue(2015);
    });

    it('calls onReferencePeriodStartChange with the column name and new value', () => {
      const props = defaultProps();
      render(<RasterMappingRowDetails {...props} />);
      fireEvent.change(screen.getByPlaceholderText('i.e. 1977'), { target: { value: '1980' } });
      expect(props.onReferencePeriodStartChange).toHaveBeenCalledWith('Carbon_organic', '1980');
    });

    it('calls onReferencePeriodStopChange with the column name and new value', () => {
      const props = defaultProps();
      render(<RasterMappingRowDetails {...props} />);
      fireEvent.change(screen.getByPlaceholderText('i.e. 2015'), { target: { value: '2020' } });
      expect(props.onReferencePeriodStopChange).toHaveBeenCalledWith('Carbon_organic', '2020');
    });
  });

  describe('layer description', () => {
    it('reflects layerDescription as the textarea value', () => {
      render(<RasterMappingRowDetails {...defaultProps({ layerDescription: 'A description' })} />);
      expect(screen.getByTestId('sh-ui-textareafield')).toHaveValue('A description');
    });

    it('calls onLayerDescriptionChange with the column name and new value', () => {
      const props = defaultProps();
      render(<RasterMappingRowDetails {...props} />);
      fireEvent.change(screen.getByTestId('sh-ui-textareafield'), { target: { value: 'Updated description' } });
      expect(props.onLayerDescriptionChange).toHaveBeenCalledWith('Carbon_organic', 'Updated description');
    });
  });
});
