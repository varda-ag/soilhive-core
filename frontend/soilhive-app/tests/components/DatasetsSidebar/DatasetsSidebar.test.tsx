import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DatasetsSidebar } from 'components/DatasetsSidebar/DatasetsSidebar';
import useDevice from 'hooks/useDevice';

jest.mock('hooks/useDevice', () => ({
  __esModule: true,
  default: jest.fn(),
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
  // let's define the mockSetPreview mock function here and export here down below
  // so that we can later grab it
  const mockSetPreview = jest.fn();

  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      setPreview: mockSetPreview,
      datasets: ['test-dataset'],
    }),
    mockSetPreview,
  };
});

// grab the mock mockSetPreview function that was passed to availability context
const { mockSetPreview } = jest.requireMock('../../../src/contexts/AvailabilityContext');

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

  it('renders disabled button', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    const button = screen.getByText('Download');
    expect(button).toBeDisabled();
  });

  it('passes isOpened correctly to PageSidebar', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    const { rerender } = render(<DatasetsSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).not.toHaveClass('Opened');

    rerender(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toHaveClass('Opened');
  });

  it('calls setPreview when clicking on preview button', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    render(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(mockSetPreview).not.toHaveBeenCalled();

    const button = screen.getByText('Preview');
    expect(button).toBeEnabled();
    button.click();

    expect(mockSetPreview).toHaveBeenCalledTimes(1);
    expect(mockSetPreview).toHaveBeenCalledWith(true);
  });
});
