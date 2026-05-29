import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DatasetsSidebar } from 'components/DatasetsSidebar/DatasetsSidebar';
import useDevice from 'hooks/useDevice';
import { useNavigate } from 'react-router';

jest.mock('hooks/useDevice', () => ({
  __esModule: true,
  default: jest.fn(),
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
    AvailabilityContext: React.createContext({
      availableDatasets: [{ id: 'test-dataset' }],
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

describe('DatasetsSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it.skip('renders disabled button', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    const button = screen.getByText('Download');
    expect(button).toBeDisabled();
  });

  it.skip('passes isOpened correctly to PageSidebar', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    const { rerender } = render(<DatasetsSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).not.toHaveClass('Opened');

    rerender(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toHaveClass('Opened');
  });

  it('disables download button on mobile layout', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: false, isMobileLayout: true });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    expect(downloadButton).toBeDisabled();
  });

  it('calls navigate when clicking on download button on desktop', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true, isMobileLayout: false });

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
