import { render, screen } from '@testing-library/react';
import { useNavigate, useParams } from 'react-router';
import { DatasetsMappingsStep } from '../../../src/pages/AdminPortal/DatasetsMappingsStep/DatasetsMappingsStep';
import { useMappingsStep } from 'hooks/useMappingsStep';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
  useParams: jest.fn(),
}));

jest.mock('hooks/useMappingsStep');

const STUB_HOOK_RETURN = {
  columnMappings: [],
  conceptOptions: [],
  unitOptions: [],
  detailOptions: {
    samplePretreatment: [],
    technique: [],
    extractantFormulation: [],
    extractantConcentration: [],
    attractionRatio: [],
    extractionBase: [],
    instrument: [],
    limitOfDetection: [],
  },
  mappedCount: 0,
  unmappedCount: 0,
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

describe('DatasetsMappingsStep', () => {
  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(jest.fn());
    (useParams as jest.Mock).mockReturnValue({ id: '1' });
    (useMappingsStep as jest.Mock).mockReturnValue(STUB_HOOK_RETURN);
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
});
