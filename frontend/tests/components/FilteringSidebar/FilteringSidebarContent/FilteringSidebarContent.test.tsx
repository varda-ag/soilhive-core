import { render, screen } from '@testing-library/react';
import { FilteringSidebarContent } from 'components/FilteringSidebar/FilteringSidebarContent/FilteringSidebarContent';
import useAvailability from 'hooks/useAvailability';

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
  default: jest.fn(),
}));

describe('FilteringSidebarContent', () => {
  beforeEach(() => {
    jest.mocked(useAvailability).mockReturnValue({
      allRasterCategories: [{ id: 'agroecological_zones', enabled: true }],
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it('renders three sections with child components', () => {
    const { container } = render(<FilteringSidebarContent />);

    const sections = screen.getAllByTestId('sh-filtering-sidebar-section');
    expect(sections).toHaveLength(3);
    expect(screen.getByTestId('mock-filtering-sidebar-parameters')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-datascope')).toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar-land-ecosystem')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  const reasterCombinations = [
    ['a non-soil_groups enabled category', [{ id: 'agroecological_zones', enabled: true }], 3],
    ['only disabled categories', [{ id: 'agroecological_zones', enabled: false }], 2],
    ['only soil_groups enabled', [{ id: 'soil_groups', enabled: true }], 2],
    ['undefined categories', undefined, 2],
  ] as const;

  it.each(reasterCombinations)('renders %s sections when allRasterCategories is %s', (_, allRasterCategories, expectedSections) => {
    jest.mocked(useAvailability).mockReturnValue({ allRasterCategories } as any);

    render(<FilteringSidebarContent />);

    expect(screen.getAllByTestId('sh-filtering-sidebar-section')).toHaveLength(expectedSections);
  });
});
