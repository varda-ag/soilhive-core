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

    const button = screen.getByTestId('sh-ui-button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Download data');
  });

  it('passes isOpened correctly to PageSidebar', () => {
    (useDevice as jest.Mock).mockReturnValue({ isDesktopLayout: true });

    const { rerender } = render(<DatasetsSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).not.toHaveClass('Opened');

    rerender(<DatasetsSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toHaveClass('Opened');
  });
});
