import { act, render } from '@testing-library/react';
import DownloadPreview from '../../src/pages/DownloadPreview';
import { useNavigate } from 'react-router';

jest.mock('hooks/useDevice');

jest.mock('hooks/useDataFilterQuery', () => {
  return { useDataFilterQuery: jest.fn().mockReturnValue({ filterId: 'test-filter-id', isLoading: false }) };
});

jest.mock('hooks/useFilteredCoverageQuery', () => {
  return { useFilteredCoverageQuery: jest.fn().mockReturnValue({ data: undefined, isLoading: false }) };
});

jest.mock('hooks/useSoilData', () => {
  return {
    useSoilData: jest.fn().mockReturnValue({ allData: [], isLoading: false, hasMore: false, loadMore: jest.fn(), reset: jest.fn() }),
  };
});

jest.mock('react-router', () => ({
  __esModule: true,
  useNavigate: jest.fn(),
  useSearchParams: jest.fn().mockReturnValue([new Map([])]),
}));

jest.mock('components/DownloadDataSummary/DownloadDataSummary', () => {
  const DownloadDataSummary = () => <div>Mock DownloadDataSummary</div>;
  return DownloadDataSummary;
});

jest.mock('components/DownloadPreview/DownloadPreviewDataSection/DownloadPreviewDataSection', () => {
  const DownloadPreviewDataSection = () => <div>Mock DownloadPreviewDataSection</div>;
  return DownloadPreviewDataSection;
});

jest.mock('hooks/useDownloadPreview', () => {
  return {
    useDownloadPreview: jest.fn().mockReturnValue({
      datasetsSummary: {
        globalMinDepth: null,
        globalMaxDepth: null,
      },
      availableFixedDatasets: [{ id: 'test-dataset', soil_properties: ['test-soil-property'] }],
      availabilitySelectedSoilProperties: [],
      availabilityFilteredSoilProperties: [{ id: 'test-soil-property' }],
      selectedDatasets: [],
      setSelectedDatasets: jest.fn(),
      geometryFilter: [],
      isLoading: false,
    }),
  };
});

describe('DownloadPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders download preview page', () => {
    const { container } = render(<DownloadPreview />);
    expect(container).toMatchSnapshot();
  });

  it('calls navigate when clicking on the back button', async () => {
    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);
    const { container, getByTestId } = render(<DownloadPreview />);
    expect(container).toMatchSnapshot();
    const backButton = getByTestId('download-preview-back-button');
    await act(async () => backButton.click());
    expect(navigateMockFn).toHaveBeenCalledWith(-1);
  });
});
