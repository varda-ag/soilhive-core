import { render, screen } from '@testing-library/react';
import { useNavigate, useParams } from 'react-router';
import { DatasetsMappingsStep } from '../../../src/pages/AdminPortal/DatasetsMappingsStep/DatasetsMappingsStep';
import { useMappingsStep, type RowDetails, type DetailOptionMap } from 'hooks/useMappingsStep';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock('hooks/useMappingsStep', () => ({
  useMappingsStep: jest.fn(),
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
) {
  return {
    isLoading: false,
    geometryMessage,
    depthConflictMessage,
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

describe('DatasetsMappingsStep', () => {
  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(jest.fn());
    (useParams as jest.Mock).mockReturnValue({ id: '1' });
    (useMappingsStep as jest.Mock).mockReturnValue(stubHookReturn());
  });

  it('renders the page title', () => {
    render(<DatasetsMappingsStep />);
    expect(screen.getByText('Map fields')).toBeInTheDocument();
  });

  it('renders the banner', () => {
    render(<DatasetsMappingsStep />);
    expect(screen.getByTestId('sh-mappings-banner')).toBeInTheDocument();
  });

  it('renders the mappings table', () => {
    render(<DatasetsMappingsStep />);
    expect(screen.getByTestId('sh-mappings-table')).toBeInTheDocument();
  });

  describe('geometry detection message', () => {
    it('shows the info message when hook provides an info geometry message', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(stubHookReturn([], { message: 'Geometry was automatically detected.', type: 'info' }));
      render(<DatasetsMappingsStep />);
      expect(screen.getByText('Geometry was automatically detected.')).toBeInTheDocument();
    });

    it('shows the warning message when hook provides a warning geometry message', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(stubHookReturn([], { message: 'No geometry was detected.', type: 'warning' }));
      render(<DatasetsMappingsStep />);
      expect(screen.getByText('No geometry was detected.')).toBeInTheDocument();
    });

    it('shows no geometry message when hook returns null', () => {
      render(<DatasetsMappingsStep />);
      expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
    });
  });

  describe('depth conflict message', () => {
    it('shows the warning when hook provides a depth conflict message', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(
        stubHookReturn([], null, false, {
          message: "The 'depth' field cannot be used together with 'min depth' or 'max depth'.",
          type: 'warning',
        }),
      );
      render(<DatasetsMappingsStep />);
      expect(screen.getByTestId('sh-form-message')).toBeInTheDocument();
    });

    it('shows no depth conflict message when hook returns null (other messages can still render)', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(
        stubHookReturn([], { message: 'Geometry was automatically detected.', type: 'info' }, false, null),
      );
      render(<DatasetsMappingsStep />);
      expect(screen.getAllByTestId('sh-form-message')).toHaveLength(1);
    });

    it('renders both messages when geometry and depth conflict messages are both non-null', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(
        stubHookReturn([], { message: 'No geometry was detected.', type: 'warning' }, false, {
          message: "The 'depth' field cannot be used together with 'min depth' or 'max depth'.",
          type: 'warning',
        }),
      );
      render(<DatasetsMappingsStep />);
      expect(screen.getAllByTestId('sh-form-message')).toHaveLength(2);
    });
  });

  describe('action buttons', () => {
    it('is disabled when isContinueEnabled is false', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(stubHookReturn([], null, false));
      render(<DatasetsMappingsStep />);
      expect(screen.getByTestId('sh-mappings-continue')).toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).toBeDisabled();
    });

    it('is enabled when isContinueEnabled is true', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(stubHookReturn([], null, true));
      render(<DatasetsMappingsStep />);
      expect(screen.getByTestId('sh-mappings-continue')).not.toBeDisabled();
      expect(screen.getByTestId('sh-mappings-save-later')).not.toBeDisabled();
    });
  });

  describe('mapping rows', () => {
    it('renders no rows when the hook returns an empty column list', () => {
      render(<DatasetsMappingsStep />);
      expect(screen.queryAllByTestId('sh-mapping-row')).toHaveLength(0);
    });

    it('renders one row per column mapping returned by the hook', () => {
      (useMappingsStep as jest.Mock).mockReturnValue(stubHookReturn(['Carbon_organic', 'Sand', 'PH']));
      render(<DatasetsMappingsStep />);
      expect(screen.getAllByTestId('sh-mapping-row')).toHaveLength(3);
    });
  });
});
