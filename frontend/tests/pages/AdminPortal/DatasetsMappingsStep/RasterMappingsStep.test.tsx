import { render, screen, fireEvent } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { RasterMappingsStep } from '../../../../src/pages/AdminPortal/DatasetsMappingsStep/RasterMappingsStep';
import { useRasterMappingStep, type RowDetails, type DetailOptionMap } from 'hooks/useRasterMappingStep';
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

function stubHookReturn(
  columnNames: string[] = [],
  geometryMessage: { message: string; type: 'info' | 'warning' } | null = null,
  isContinueEnabled = false,
  depthConflictMessage: { message: string; type: 'warning' } | null = null,
  isSaveEnabled = false,
  showLoadingPanel = false,
) {
  return {
    isLoading: false,
    isImporting: false,
    showLoadingPanel,
    geometryMessage,
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

  describe('geometry detection message', () => {
    it('shows the info message when hook provides an info geometry message', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn([], { message: 'Geometry was automatically detected.', type: 'info' }),
      );
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('Geometry was automatically detected.')).toBeInTheDocument();
    });

    it('shows the warning message when hook provides a warning geometry message', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], { message: 'No geometry was detected.', type: 'warning' }));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('No geometry was detected.')).toBeInTheDocument();
    });

    it('shows no geometry message when hook returns null', () => {
      render(<RasterMappingsStep id="1" />);
      expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    });
  });

  describe('depth conflict message', () => {
    it('shows the warning when hook provides a depth conflict message', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn([], null, false, {
          message: "The 'depth' field cannot be used together with 'min depth' or 'max depth'.",
          type: 'warning',
        }),
      );
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-form-message')).toBeInTheDocument();
    });

    it('shows no depth conflict message when hook returns null (other messages can still render)', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn([], { message: 'Geometry was automatically detected.', type: 'info' }, false, null),
      );
      render(<RasterMappingsStep id="1" />);
      expect(screen.getAllByTestId('sh-form-message')).toHaveLength(1);
    });

    it('renders both messages when geometry and depth conflict messages are both non-null', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn([], { message: 'No geometry was detected.', type: 'warning' }, false, {
          message: "The 'depth' field cannot be used together with 'min depth' or 'max depth'.",
          type: 'warning',
        }),
      );
      render(<RasterMappingsStep id="1" />);
      expect(screen.getAllByTestId('sh-form-message')).toHaveLength(2);
    });
  });

  describe('action buttons', () => {
    it('disables both buttons when neither flag is set', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], null, false, null, false));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).toBeDisabled();
    });

    it('enables save-later but not continue when only isSaveEnabled is true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], null, false, null, true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });

    it('enables both buttons when isContinueEnabled and isSaveEnabled are both true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], null, true, null, true));
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
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], null, false, null, false, true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('Data loading started')).toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-raster-mappings-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-continue')).not.toBeInTheDocument();
    });

    it('calls navigate with the datasets path when the panel Continue button is clicked', () => {
      const navigateMock = jest.fn();
      (useNavigate as jest.Mock).mockReturnValue(navigateMock);
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], null, false, null, false, true));
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
