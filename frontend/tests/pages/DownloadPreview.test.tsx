import { act, render, screen } from '@testing-library/react';
import DownloadPreview from '../../src/pages/DownloadPreview';
import { useLocation, useNavigate } from 'react-router';
import { __setIsMobileLayout, __resetIsMobileLayout, __setIsMobileDevice, __resetIsMobileDevice } from 'hooks/useDevice';
import { useDownloadPreview } from 'hooks/useDownloadPreview';
import { useSoilData } from 'hooks/useSoilData';
import { useIsSignInRequiredToDownload } from 'hooks/useIsSignInRequiredToDownload';

jest.mock('hooks/useDevice');

jest.mock('hooks/useIsSignInRequiredToDownload', () => ({
  useIsSignInRequiredToDownload: jest.fn(),
}));

jest.mock('components/DownloadSignInDialog/DownloadSignInDialog', () => ({
  DownloadSignInDialog: ({ visible }: any) => (visible ? <div data-testid="download-sign-in-dialog" /> : null),
}));

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
  useLocation: jest.fn(),
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
    (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(false);
    // Reached from another page of the app, unless a test says otherwise
    (useLocation as jest.Mock).mockReturnValue({ key: 'in-app-entry' });
  });

  afterEach(() => {
    __resetIsMobileLayout();
    __resetIsMobileDevice();
  });

  it('renders download preview page', () => {
    const { container } = render(<DownloadPreview />);
    expect(container).toMatchSnapshot();
  });

  it('disables download button on a phone', () => {
    __setIsMobileDevice(true);
    render(<DownloadPreview />);
    const downloadButton = screen.getByRole('button', { name: /download data/i });
    expect(downloadButton).toBeDisabled();
  });

  it('enables download button in a narrow window on a laptop', () => {
    __setIsMobileLayout(true);
    render(<DownloadPreview />);
    const downloadButton = screen.getByRole('button', { name: /download data/i });
    expect(downloadButton).toBeEnabled();
  });

  it('asks a signed-out visitor to log in instead of navigating, while a signed-in user is required to download', async () => {
    (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(true);
    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);
    render(<DownloadPreview />);

    const downloadButton = screen.getByRole('button', { name: /download data/i });
    expect(downloadButton).toBeEnabled();
    await act(async () => downloadButton.click());

    // The sign-in comes back to this page, where the signed-in user clicks Download data again
    expect(navigateMockFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('download-sign-in-dialog')).toBeInTheDocument();
  });

  it('calls navigate when clicking on download button on desktop', async () => {
    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);
    render(<DownloadPreview />);

    const downloadButton = screen.getByRole('button', { name: /download data/i });
    expect(downloadButton).toBeEnabled();
    await act(async () => downloadButton.click());

    expect(navigateMockFn).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/download' }));
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

  it('goes to the map on Back when no page of the app is behind this one, as after a sign-in', async () => {
    (useLocation as jest.Mock).mockReturnValue({ key: 'default' });
    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);
    render(<DownloadPreview />);

    await act(async () => screen.getByTestId('download-preview-back-button').click());

    // Not -1: the identity provider's page is behind this one
    expect(navigateMockFn).toHaveBeenCalledWith('/');
  });

  it('reads a raster dataset through the preview filter, unsorted', () => {
    const preview = (useDownloadPreview as jest.Mock)();
    (useDownloadPreview as jest.Mock).mockReturnValueOnce({ ...preview, selectedDatasets: ['raster-1'], isSelectedDatasetRaster: true });

    render(<DownloadPreview />);

    expect(useSoilData).toHaveBeenCalledWith(
      expect.objectContaining({ selectedDatasets: ['raster-1'], filterId: 'test-filter-id', sort: undefined }),
    );
  });
});
