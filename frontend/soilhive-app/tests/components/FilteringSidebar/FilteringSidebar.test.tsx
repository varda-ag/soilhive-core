import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebar } from 'components/FilteringSidebar/FilteringSidebar';
import { __setIsDesktopLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

jest.mock('components/FilteringSidebar/FilteringSidebarHeader/FilteringSidebarHeader', () => ({
  FilteringSidebarHeader: ({ onClose }: any) => (
    <div data-testid="mock-sidebar-header" onClick={onClose}>
      FilteringSidebarHeader
    </div>
  ),
}));

jest.mock('components/FilteringSidebar/FilteringSidebarContent/FilteringSidebarContent', () => ({
  FilteringSidebarContent: () => <div data-testid="mock-sidebar-content">FilteringSidebarContent</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarMobileContent/FilteringSidebarMobileContent', () => ({
  FilteringSidebarMobileContent: () => <div data-testid="mock-sidebar-mobile-content">FilteringSidebarMobileContent</div>,
}));

describe('FilteringSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the sidebar with header on desktop layout', () => {
    __setIsDesktopLayout(true);

    render(<FilteringSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar-header')).toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar-content')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-sidebar-mobile-content')).not.toBeInTheDocument();
  });

  it('renders mobile content without header on mobile/tablet devices', () => {
    __setIsDesktopLayout(false);

    render(<FilteringSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.queryByTestId('mock-sidebar-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-sidebar-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-sidebar-mobile-content')).toBeInTheDocument();
  });

  it('calls onClose when header is clicked', async () => {
    const onClose = jest.fn();
    __setIsDesktopLayout(true);

    render(<FilteringSidebar isOpened={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('mock-sidebar-header'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes isOpened correctly to PageSidebar', () => {
    __setIsDesktopLayout(true);

    const { rerender } = render(<FilteringSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).not.toHaveClass('Opened');

    rerender(<FilteringSidebar isOpened={true} onClose={() => {}} />);

    expect(screen.getByTestId('sh-ui-page-sidebar')).toHaveClass('Opened');
  });
});
