import type { ReactNode } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

// MappingsTable's own rendering/derivation logic is covered by MappingsTable.test.tsx —
// stub it here so these tests stay focused on RasterMappingsStep's layout/wiring.
jest.mock('../../../../src/pages/AdminPortal/DatasetsMappingsStep/MappingsTable', () => ({
  MappingsTable: ({
    columnMappings,
    dataTestId,
    hasExtraColumn,
    renderRow,
  }: {
    columnMappings: ColumnMapping[];
    dataTestId: string;
    hasExtraColumn?: boolean;
    renderRow: (columnName: string) => ReactNode;
  }) => (
    <div data-testid={dataTestId} data-has-extra-column={String(!!hasExtraColumn)}>
      {columnMappings.map(m => renderRow(m.columnName))}
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
  showLoadingPanel = false,
  invalidDepthColumns: Set<string> = new Set(),
  depthValidationMessage: { message: string; type: 'error' } | null = null,
  isSaveEnabled = true,
  referencePeriodErrors: Record<string, { start: boolean; stop: boolean }> | null = null,
  referencePeriodValidationMessage: { message: string; type: 'error' } | null = null,
) {
  return {
    isLoading: false,
    isImporting: false,
    showLoadingPanel,
    isSaveEnabled,
    isContinueEnabled,
    columnMappings: columnNames.map(columnName => ({
      columnName,
      conceptId: null,
      unitId: null,
      minDepth: null,
      maxDepth: null,
      referencePeriodStart: null,
      referencePeriodStop: null,
      layerDescription: null,
      additionalResources: [],
      isGeometryDetectedField: false,
      details: { ...EMPTY_DETAILS },
    })),
    conceptOptionsByColumn: {},
    unitOptionsByConcept: {},
    detailOptions: DETAIL_OPTIONS,
    mappedCount: 0,
    unmappedCount: columnNames.length,
    invalidDepthColumns,
    depthValidationMessage,
    // The hook keys these per column, error-free by default, rather than leaving the record
    // empty — so the component's `?? { start: false, stop: false }` fallback stays a genuine
    // guard instead of the path every test happens to take.
    referencePeriodErrors:
      referencePeriodErrors ?? Object.fromEntries(columnNames.map(columnName => [columnName, { start: false, stop: false }])),
    referencePeriodValidationMessage,
    expandedRows: new Set<string>(),
    toggleRow: jest.fn(),
    handleConceptChange: jest.fn(),
    handleUnitChange: jest.fn(),
    handleMinDepthChange: jest.fn(),
    handleMaxDepthChange: jest.fn(),
    handleDetailChange: jest.fn(),
    handleReferencePeriodStartChange: jest.fn(),
    handleReferencePeriodStopChange: jest.fn(),
    handleLayerDescriptionChange: jest.fn(),
    handleAdditionalResourcesChange: jest.fn(),
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

  it('tells the mappings table to render the extra (depth) column', () => {
    render(<RasterMappingsStep id="1" />);
    expect(screen.getByTestId('sh-raster-mappings-table')).toHaveAttribute('data-has-extra-column', 'true');
  });

  describe('action buttons', () => {
    it('save-later is always enabled; continue reflects isContinueEnabled', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });

    it('enables continue when isContinueEnabled is true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-continue')).not.toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });

    it('disables save-later when isSaveEnabled is false', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, false, new Set(), null, false));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByTestId('sh-mappings-save-later')).toBeDisabled();
    });
  });

  describe('DataLoadingStartedPanel', () => {
    it('does not render the panel when showLoadingPanel is false', () => {
      render(<RasterMappingsStep id="1" />);
      expect(screen.queryByText('Data loading started')).not.toBeInTheDocument();
    });

    it('renders the panel and hides the regular content when showLoadingPanel is true', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, true));
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('Data loading started')).toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-raster-mappings-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-continue')).not.toBeInTheDocument();
    });

    it('calls navigate with the datasets path when the panel Continue button is clicked', () => {
      const navigateMock = jest.fn();
      (useNavigate as jest.Mock).mockReturnValue(navigateMock);
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn([], false, true));
      render(<RasterMappingsStep id="1" />);
      fireEvent.click(screen.getByText('Continue'));
      expect(navigateMock).toHaveBeenCalledWith(ADMIN_PATHS.DATASETS);
    });

    it('also renders the panel when isImporting is true, even though showLoadingPanel is false', () => {
      // Covers mount/reload while the backend still reports an in-flight import (isImporting via
      // serverIsImporting) — this now routes to the same "started" panel as a fresh Continue click,
      // instead of the old separate "Mapping fields" spinner.
      (useRasterMappingStep as jest.Mock).mockReturnValue({ ...stubHookReturn(), isImporting: true });
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('Data loading started')).toBeInTheDocument();
      expect(screen.queryByTestId('sh-mappings-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-raster-mappings-table')).not.toBeInTheDocument();
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

  describe('depth validation', () => {
    it('shows no message when depthValidationMessage is null', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(stubHookReturn(['col1'], false, false, new Set(), null));
      render(<RasterMappingsStep id="1" />);
      expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    });

    it('shows the depth validation message when the hook provides one', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn(['col1'], false, false, new Set(['col1']), {
          message: 'Min and max depth are required for every mapped layer.',
          type: 'error',
        }),
      );
      render(<RasterMappingsStep id="1" />);
      expect(screen.getByText('Min and max depth are required for every mapped layer.')).toBeInTheDocument();
    });

    it('marks the min/max depth inputs as errored only for columns in invalidDepthColumns', () => {
      (useRasterMappingStep as jest.Mock).mockReturnValue(
        stubHookReturn(['col1', 'col2'], false, false, new Set(['col1']), {
          message: 'Min and max depth are required for every mapped layer.',
          type: 'error',
        }),
      );
      render(<RasterMappingsStep id="1" />);
      const rows = screen.getAllByTestId('sh-mapping-row');
      const [col1Row, col2Row] = rows;

      expect(within(col1Row).getByPlaceholderText('From').closest('[data-testid="sh-ui-textinput"]')).toHaveClass('Invalid');
      expect(within(col1Row).getByPlaceholderText('To').closest('[data-testid="sh-ui-textinput"]')).toHaveClass('Invalid');
      expect(within(col2Row).getByPlaceholderText('From').closest('[data-testid="sh-ui-textinput"]')).not.toHaveClass('Invalid');
      expect(within(col2Row).getByPlaceholderText('To').closest('[data-testid="sh-ui-textinput"]')).not.toHaveClass('Invalid');
    });
  });
});
