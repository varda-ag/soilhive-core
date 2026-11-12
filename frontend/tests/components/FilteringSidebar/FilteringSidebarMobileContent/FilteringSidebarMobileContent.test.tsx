import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarMobileContent } from 'components/FilteringSidebar/FilteringSidebarMobileContent/FilteringSidebarMobileContent';
import useAvailability from 'hooks/useAvailability';

jest.mock('components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters', () => ({
  FilteringSidebarParameters: () => <div data-testid="mock-filtering-sidebar-parameters">Mock FilteringSidebarParameters</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope', () => ({
  FilteringSidebarDataScope: () => <div data-testid="mock-filtering-sidebar-datascope">Mock FilteringSidebarDataScope</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarLandEnvironment/FilteringSidebarLandEnvironment', () => ({
  FilteringSidebarLandEnvironment: () => (
    <div data-testid="mock-filtering-sidebar-land-environment">Mock FilteringSidebarLandEnvironment</div>
  ),
}));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const withRasterFilters = { allRasterCategories: [{ id: 'land_cover', name: 'Land Cover', enabled: true, active: true }] } as any;

describe('FilteringSidebarMobileContent', () => {
  beforeEach(() => {
    jest.mocked(useAvailability).mockReturnValue(withRasterFilters);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders component by default', () => {
    const { container } = render(<FilteringSidebarMobileContent />);

    expect(container).toMatchSnapshot();
  });

  it('changes tabs by clicking on mobile navigation', () => {
    render(<FilteringSidebarMobileContent />);

    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-filtering-sidebar-parameters')).not.toBeInTheDocument();

    const navButtons = screen.getAllByTestId('sh-ui-mobile-tab-navigation-item');
    fireEvent.click(navButtons[1]);

    expect(screen.queryByTestId('mock-filtering-sidebar-datascope')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();

    fireEvent.click(navButtons[2]);

    expect(screen.getByTestId('mock-filtering-sidebar-land-environment')).toBeInTheDocument();
  });

  it.each([
    ['no categories', []],
    ['undefined categories', undefined],
    ['only inactive categories', [{ id: 'land_cover', name: 'Land Cover', enabled: true, active: false }]],
    ['only disabled categories', [{ id: 'land_cover', name: 'Land Cover', enabled: false, active: true }]],
  ])('hides the Land & environment tab when there are %s', (_, allRasterCategories) => {
    jest.mocked(useAvailability).mockReturnValue({ allRasterCategories } as any);

    render(<FilteringSidebarMobileContent />);

    expect(screen.getAllByTestId('sh-ui-mobile-tab-navigation-item')).toHaveLength(2);
    expect(screen.queryByText('Land & environment')).not.toBeInTheDocument();
  });

  it('goes back to Data scope when the open Land & environment tab is hidden', () => {
    const { rerender } = render(<FilteringSidebarMobileContent />);

    fireEvent.click(screen.getByText('Land & environment'));
    expect(screen.getByTestId('mock-filtering-sidebar-land-environment')).toBeInTheDocument();

    jest.mocked(useAvailability).mockReturnValue({ allRasterCategories: [] } as any);
    rerender(<FilteringSidebarMobileContent />);

    expect(screen.queryByTestId('mock-filtering-sidebar-land-environment')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
  });
});
