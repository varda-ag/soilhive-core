import { render, screen, fireEvent } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { RasterMappingsStep } from '../../../../src/pages/AdminPortal/DatasetsMappingsStep/RasterMappingsStep';
import { useRasterMappingStep, type RowDetails, type DetailOptionMap, type ColumnMapping } from 'hooks/useRasterMappingStep';
import { ADMIN_PATHS } from 'configuration/admin';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useRasterMappingStep', () => ({
  useRasterMappingStep: jest.fn(),
}));

jest.mock('../../../../src/pages/AdminPortal/DatasetsMappingsStep/MappingsBanner', () => ({
  MappingsBanner: ({ isRaster }: { isRaster?: boolean }) => <div data-testid="sh-mappings-banner" data-israster={String(!!isRaster)} />,
}));

// RasterMappingsTable's own rendering/derivation logic is covered by RasterMappingsTable.test.tsx —
// stub it here so these tests stay focused on RasterMappingsStep's layout/wiring.
jest.mock('../../../../src/pages/AdminPortal/DatasetsMappingsStep/RasterMappingsTable', () => ({
  RasterMappingsTable: ({ columnMappings }: { columnMappings: ColumnMapping[] }) => (
    <div data-testid="sh-raster-mappings-table">
      {columnMappings.map(m => (
        <div key={m.columnName} data-testid="sh-mapping-row" />
      ))}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DETAILS: RowDetails = {
  laboratoryMethod: null,
};

const DETAIL_OPTIONS: DetailOptionMap = {
  laboratoryMethod: [],
};

function stubHookReturn(
  columnNames: string[] = [],
  isContinueEnabled = false,
  depthConflictMessage: { message: string; type: 'warning' } | null = null,
  isSaveEnabled = false,
  showLoadingPanel = false,
) {
  return {
    isLoading: false,
    isImporting: false,
    showLoadingPanel,
    depthConflictMessage,
    isSaveEnabled,
    isContinueEnabled,
    columnMappings: columnNames.map(columnName => ({
      columnName,
      conceptId: null,
      unitId: null,
      details: { ...EMPTY_DETAILS },
    })),
    conceptOptionsByColumn: {},
    unitOptions: [],
    detailOptions: DETAIL_OPTIONS,
    mappedCount: 0,
    unmappedCount: columnNames.length,
    expandedRows: new Set<string>(),
    isUnitEnabled: jest.fn().mockReturnValue(false),
    toggleRow: jest.fn(),
    handleConceptChange: jest.fn(),
    handleUnitChange: jest.fn(),
    handleDetailChange: jest.fn(),
    handleReferencePeriodStartChange: jest.fn(),
    handleReferencePeriodStopChange: jest.fn(),
    handleLayerDescriptionChange: jest.fn(),
    handlePrevious: jest.fn(),
    handleSaveAndContinueLater: jest.fn(),
    handleContinue: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RasterMappingsStep', () => {
  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(jest.fn());
    (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn());
  });

  it('renders the fields title and subtitle', () => {
    render(<RasterMappingsStep id="1" />);
    expect(screen.getByText('Map layers')).toBeInTheDocument();
    expect(screen.getByText('Map your layers to standard concepts and units')).toBeInTheDocument();
  });

  it('renders the banner as raster', () => {
    render(<RasterMappingsStep id="1" />);
    expect(screen.getByTestId('sh-mappings-banner')).toHaveAttribute('data-israster', 'true');
  });

  it('renders the mappings table', () => {
    render(<RasterMappingsStep id="1" />);
    expect(screen.getByTestId('sh-raster-mappings-table')).toBeInTheDocument();
  });

  describe('depth conflict message', () => {
    it('shows the warning when hook provides a depth conflict message', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn([], false, {
          message: "The 'min depth' field must be paired with 'max depth'.",
          type: 'warning',
        }),
      );
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-form-message')).toBeInTheDocument();
    });

    it('shows no message when depthConflictMessage is null', () => {
      render(<RasterMappingsStep id="1" />);
      expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('disables both buttons when neither flag is set', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, null, false));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).toBeDisabled();
    });

    it('enables save-later but not continue when only isSaveEnabled is true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, null, true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });

    it('enables both buttons when isContinueEnabled and isSaveEnabled are both true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], true, null, true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).not.toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });
  });

  describe('DataLoadingStartedPanel', () => {
    it('does not render the panel when showLoadingPanel is false', () => {
      render(<RasterMappingsStep id="1" />);
      expect(screen.queryByText('Data loading started')).not.toBeInTheDocument();
    });

    it('renders the panel and hides the regular content when showLoadingPanel is true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, null, false, true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('Data loading started')).toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-raster-mappings-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-continue')).not.toBeInTheDocument();
    });

    it('calls navigate with the datasets path when the panel Continue button is clicked', () => {
      const navigateMock = jest.fn();
      (useNavigate as jest.Mock).mockReturnValue(navigateMock);
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, null, false, true));
      render(<RasterMappingsStep id="1" />);
      fireEvent.click(screen.getByText('Continue'));
      expect(navigateMock).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS);
    });
  });

  describe('mapping rows', () => {
    it('renders no rows when the hook returns an empty column list', () => {
      render(<RasterMappingsStep id="1" />);
      expect(screen.queryAllByTestId('sh-mapping-row')).toHaveLength(0);
    });

    it('renders one row per column mapping returned by the hook', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn(['Carbon_organic', 'Sand', 'PH']));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getAllByTestId('sh-mapping-row')).toHaveLength(3);
    });
  });
});
