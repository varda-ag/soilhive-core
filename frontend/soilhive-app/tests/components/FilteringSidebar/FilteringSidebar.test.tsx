import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebar } from 'components/FilteringSidebar/FilteringSidebar';
import { __setIsDesktopLayout } from 'hooks/useDevice';
import useDataScopeFilters from 'hooks/useDataScopeFilters';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';

jest.mock('hooks/useDevice');

jest.mock('hooks/useDataScopeFilters', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useSoilPropertiesFilters', () => ({
  __esModule: true,
  default: jest.fn(),
}));

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
    (useDataScopeFilters as jest.Mock).mockReturnValue({
      isLoading: false,
      hasUnavailableScopeSelected: false,
    });
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue({
      hasUnavailablePropertySelected: false,
    });
  });

  afterEach(() => {
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

  it('shows "unavailable filters" message if theree is an unavailable filter selected in the data scope filters', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValue({
      isLoading: false,
      hasUnavailableScopeSelected: true,
    });

    render(<FilteringSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-unavailable-filter-message')).toBeInTheDocument();
  });

  it('shows "unavailable filters" message if theree is an unavailable filter selected in the soil parameters filters', () => {
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue({
      hasUnavailablePropertySelected: true,
    });

    render(<FilteringSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.getByTestId('sh-unavailable-filter-message')).toBeInTheDocument();
  });

  it('does not show "unavailable filters" message if theree is a loading state', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValue({
      isLoading: true,
      hasUnavailableScopeSelected: true,
    });
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue({
      hasUnavailablePropertySelected: true,
    });

    render(<FilteringSidebar isOpened={false} onClose={() => {}} />);

    expect(screen.queryByTestId('sh-unavailable-filter-message')).not.toBeInTheDocument();
  });
});
