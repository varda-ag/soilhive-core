import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DatasetsSidebar } from 'components/DatasetsSidebar/DatasetsSidebar';
import useDevice from 'hooks/useDevice';
import { useNavigate } from 'react-router';
import { AvailabilityContext } from '../../../src/contexts/AvailabilityContext';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { Capability, GISDataType } from 'types/backend';
import { useIsSignInRequiredToDownload } from 'hooks/useIsSignInRequiredToDownload';

jest.mock('hooks/useDevice', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useIsSignInRequiredToDownload', () => ({
  useIsSignInRequiredToDownload: jest.fn(),
}));

jest.mock('components/DownloadSignInDialog/DownloadSignInDialog', () => ({
  DownloadSignInDialog: ({ visible, onClose }: any) =>
    visible ? (
      <div data-testid="download-sign-in-dialog">
        <button onClick={onClose}>cancel sign-in</button>
      </div>
    ) : null,
}));

jest.mock('hooks/useEntitlementsHook', () => ({
  useEntitlements: jest.fn(),
}));

jest.mock('react-router', () => ({
  __esModule: true,
  useNavigate: jest.fn(),
}));

jest.mock('components/DatasetsSidebar/DatasetsSidebarHeader/DatasetsSidebarHeader', () => ({
  DatasetsSidebarHeader: ({ onClose }: any) => (
    <div data-testid="mock-sidebar-header" onClick={onClose}>
      HEADER
    </div>
  ),
}));

jest.mock('components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummary', () => ({
  DatasetsSidebarSummary: () => <div data-testid="mock-sidebar-summary">SUMMARY</div>,
}));

jest.mock('components/DatasetsSidebar/DatasetsList/DatasetsList', () => ({
  DatasetsList: () => <div data-testid="mock-datasets-list">LIST</div>,
}));

jest.mock('../../../src/contexts/AvailabilityContext', () => {
  return {
    __esModule: true,
    // Public visibility grants both Explore and Download on its own, without an entitlements
    // row — matches the old default fixture's "preview" + "download" capabilities.
    AvailabilityContext: React.createContext({
      availableDatasets: [{ id: 'test-dataset', visibility: 'public' }],
      filterId: 'mock-filter-id',
      datasetFrontendFilters: { type: [] },
      datasetsSummary: { count: 5, dataPoints: 1000, layers: 3, depth: '0-30', date: '2020 - 2024' },
    }),
  };
});

jest.mock('../../../src/contexts/AvailabilityMapContext', () => {
  return {
    __esModule: true,
    AvailabilityMapContext: React.createContext({
      selectionType: 'mock-selection-type',
      locationName: undefined,
    }),
  };
});

function mockCan(capabilitiesById: Record<string, Capability[]>) {
  (useEntitlements as jest.Mock).mockReturnValue({
    can: (capability: Capability, id?: string) => (id ? (capabilitiesById[id] ?? []).includes(capability) : false),
    isLoading: false,
  });
}

function renderWithDatasets(
  availableDatasets: unknown[],
  filterState: { filterId: string | undefined; isLoadingFilterId: boolean } = { filterId: 'mock-filter-id', isLoadingFilterId: false },
) {
  const contextValue = {
    availableDatasets,
    ...filterState,
    datasetFrontendFilters: { type: [] },
    datasetsSummary: { count: 5, dataPoints: 1000, layers: 3, depth: '0-30', date: '2020 - 2024' },
  } as unknown as React.ContextType<typeof AvailabilityContext>;

  return render(
    <AvailabilityContext.Provider value={contextValue}>
      <DatasetsSidebar isOpened={true} onClose={() => {}} />
    </AvailabilityContext.Provider>,
  );
}

describe('DatasetsSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCan({});
    (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(false);
  });

  it('renders the sidebar with header on desktop layout', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar-header')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar-summary')).toBeInTheDocument();
    expect(screen.getByTestId('mock-datasets-list')).toBeInTheDocument();
  });

  it('does NOT render header on mobile layout', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.queryByTestId('mock-sidebar-header')).toBeNull();
  });

  it('calls onClose when header is clicked', async () => {
    const onClose = jest.fn();
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    render(<DatasetsSidebar isOpened={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('mock-sidebar-header'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables explore and download buttons when there are no available datasets', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });

    renderWithDatasets([]);

    expect(screen.getByRole('button', { name: /explore/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled();
  });

  it('disables explore and download buttons while the filter id is loading', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });

    // During the debounce the previous filter's id is still set
    renderWithDatasets([{ id: 'test-dataset', visibility: 'public' }], { filterId: 'previous-filter-id', isLoadingFilterId: true });

    expect(screen.getByRole('button', { name: /explore/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled();
  });

  it('disables explore and download buttons when the filter id is missing after loading', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });

    // e.g. the full-filter POST failed
    renderWithDatasets([{ id: 'test-dataset', visibility: 'public' }], { filterId: undefined, isLoadingFilterId: false });

    expect(screen.getByRole('button', { name: /explore/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled();
  });

  it('enables explore button when only raster datasets are available', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });
    mockCan({ 'raster-dataset': [Capability.PREVIEW] });

    renderWithDatasets([{ id: 'raster-dataset', data_type: GISDataType.RASTER, visibility: 'private' }]);

    expect(screen.getByRole('button', { name: /explore/i })).toBeEnabled();
  });

  it('enables only explore for a dataset with PREVIEW but not DOWNLOAD', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });
    mockCan({ 'preview-only-dataset': [Capability.PREVIEW] });

    renderWithDatasets([{ id: 'preview-only-dataset', visibility: 'private' }]);

    expect(screen.getByRole('button', { name: /explore/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeDisabled();
  });

  it('enables only download for a dataset with DOWNLOAD but not PREVIEW', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });
    mockCan({ 'download-only-dataset': [Capability.DOWNLOAD] });

    renderWithDatasets([{ id: 'download-only-dataset', visibility: 'private' }]);

    expect(screen.getByRole('button', { name: /explore/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeEnabled();
  });

  it('passes isOpened correctly to PageSidebar', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    const { rerender } = render(<DatasetsSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).not.toHaveClass('Opened');

    rerender(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toHaveClass('Opened');
  });

  it('disables download button on a phone', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true, isMobileDevice: true });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    expect(downloadButton).toBeDisabled();
  });

  it('enables download button in a narrow window on a laptop', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true, isMobileDevice: false });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    expect(downloadButton).toBeEnabled();
  });

  it('asks a signed-out visitor to log in instead of navigating, while a signed-in user is required to download', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });
    (useIsSignInRequiredToDownload as jest.Mock).mockReturnValue(true);
    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);
    expect(screen.queryByTestId('download-sign-in-dialog')).not.toBeInTheDocument();

    const downloadButton = screen.getByRole('button', { name: /download/i });
    expect(downloadButton).toBeEnabled();
    fireEvent.click(downloadButton);

    // The sign-in comes back to the map, where the signed-in user clicks Download again
    expect(navigateMockFn).not.toHaveBeenCalled();
    expect(screen.getByTestId('download-sign-in-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'cancel sign-in' }));
    expect(screen.queryByTestId('download-sign-in-dialog')).not.toBeInTheDocument();
    expect(navigateMockFn).not.toHaveBeenCalled();
  });

  it('calls navigate when clicking on download button on desktop', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false, isMobileDevice: false });

    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    const button = screen.getByRole('button', { name: /download/i });
    expect(button).toBeEnabled();
    button.click();

    expect(navigateMockFn).toHaveBeenCalledTimes(1);
    expect(navigateMockFn).toHaveBeenCalledWith({
      pathname: '/download',
      search: '?source=availability&selectionType=mock-selection-type&filterId=mock-filter-id&datasets=test-dataset',
    });
  });

  it('calls navigate when clicking on explore button', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    const navigateMockFn = jest.fn();
    (useNavigate as jest.Mock).mockReturnValue(navigateMockFn);

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(navigateMockFn).not.toHaveBeenCalled();

    const button = screen.getByText('Explore');
    expect(button).toBeEnabled();
    button.click();

    expect(navigateMockFn).toHaveBeenCalledTimes(1);
    expect(navigateMockFn).toHaveBeenCalledWith({
      pathname: '/explore',
      search: '?selectionType=mock-selection-type&filterId=mock-filter-id&datasets=test-dataset',
    });
  });
});
