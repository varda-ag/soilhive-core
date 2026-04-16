import { render, screen } from '@testing-library/react';
import { useNavigate, useParams } from 'react-router';
import { DatasetsMappingsStep } from '../../../src/pages/AdminPortal/DatasetsMappingsStep/DatasetsMappingsStep';
import { useMappingsStep } from 'hooks/useMappingsStep';

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

const DETAIL_OPTIONS = {
  samplePretreatment: [],
  technique: [],
  extractantFormulation: [],
  extractantConcentration: [],
  attractionRatio: [],
  extractionBase: [],
  instrument: [],
  limitOfDetection: [],
};

function stubHookReturn(columnNames: string[] = []) {
  return {
    isLoading: false,
    columnMappings: columnNames.map(columnName => ({
      columnName,
      conceptId: null,
      unitId: null,
      details: { ...EMPTY_DETAILS },
    })),
    conceptOptions: [],
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
