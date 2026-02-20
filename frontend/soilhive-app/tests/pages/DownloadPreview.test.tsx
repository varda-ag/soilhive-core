import React from 'react';
import { act, render } from '@testing-library/react';
import DownloadPreview from '../../src/pages/DownloadPreview';

jest.mock('hooks/useFilteredDatasets', () => {
  return { useFilteredDatasets: jest.fn().mockReturnValue({ filterId: 'test-filter-id', isLoading: false }) };
});

jest.mock('hooks/useSoilData', () => {
  return {
    useSoilData: jest.fn().mockReturnValue({ allData: [], isLoading: false, hasMore: false, loadMore: jest.fn(), reset: jest.fn() }),
  };
});

jest.mock('components/DownloadPreview/DownloadPreviewSummary/DownloadPreviewSummary', () => {
  const DownloadPreviewSummary = () => <div>Mock DownloadPreviewSummary</div>;
  return DownloadPreviewSummary;
});

jest.mock('components/DownloadPreview/DownloadPreviewDataSection/DownloadPreviewDataSection', () => {
  const DownloadPreviewDataSection = () => <div>Mock DownloadPreviewDataSection</div>;
  return DownloadPreviewDataSection;
});

jest.mock('../../src/contexts/AvailabilityContext', () => {
  // let's define the mockSetPreview mock function here and export here down below
  // so that we can later grab it
  const mockSetPreview = jest.fn();

  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      setPreview: mockSetPreview,
      geometryFilter: [],
      selectedDatasets: ['test-dataset-id'],
      filteredDatasets: [{ id: 'test-dataset-id', soil_properties: ['test-soil-property-id'] }],
      selectedSoilProperties: ['test-soil-property-id'],
      filteredSoilProperties: [{ id: 'test-soil-property-id' }],
      datasetsSummary: {
        globalMinDepth: null,
        globalMaxDepth: null,
      },
    }),
    mockSetPreview,
  };
});

// grab the mock setGeometryFilter function that was passed to availability context
const { mockSetPreview } = jest.requireMock('../../src/contexts/AvailabilityContext');

describe('DownloadPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders download preview page', () => {
    const { container } = render(<DownloadPreview />);
    expect(container).toMatchSnapshot();
  });

  it('calls setPreview(false) when clicking on the back button', async () => {
    const { container, getByTestId } = render(<DownloadPreview />);
    expect(container).toMatchSnapshot();
    const backButton = getByTestId('download-preview-back-button');
    await act(async () => backButton.click());
    expect(mockSetPreview).toHaveBeenCalledWith(false);
  });
});
