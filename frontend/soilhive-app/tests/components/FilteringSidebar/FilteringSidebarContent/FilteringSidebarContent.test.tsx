import { render, screen } from '@testing-library/react';
import { FilteringSidebarContent } from 'components/FilteringSidebar/FilteringSidebarContent/FilteringSidebarContent';

jest.mock('components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters', () => ({
  FilteringSidebarParameters: () => <div data-testid="mock-filtering-sidebar-parameters">Mock FilteringSidebarParameters</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope', () => ({
  FilteringSidebarDataScope: () => <div data-testid="mock-filtering-sidebar-datascope">Mock FilteringSidebarDataScope</div>,
}));

jest.mock('components/FilteringSidebar/FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem', () => ({
  FilteringSidebarLandEcosystem: () => <div data-testid="mock-filtering-sidebar-land-ecosystem">Mock FilteringSidebarLandEcosystem</div>,
}));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: () => ({ allRasterCategories: [{ id: 'agroecological_zones', enabled: true }] }),
}));

describe('FilteringSidebarContent', () => {
  it('renders three sections with child components', () => {
    const { container } = render(<FilteringSidebarContent />);

    const sections = screen.getAllByTestId('sh-filtering-sidebar-section');
    expect(sections).toHaveLength(3);
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-land-ecosystem')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});
