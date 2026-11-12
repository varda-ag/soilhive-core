import { render, screen } from '@testing-library/react';
import { FilteringSidebarLandEnvironment } from 'components/FilteringSidebar/FilteringSidebarLandEnvironment/FilteringSidebarLandEnvironment';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/FilteringSidebar/RasterFilter/RasterFilter', () => ({
  RasterFilter: ({ categoryId }: { categoryId: string }) => <div data-testid={`mock-raster-filter-${categoryId}`} />,
}));

const useAvailabilityMock = useAvailability as jest.MockedFunction<typeof useAvailability>;

const ALL_CATEGORIES = [
  { id: 'soil_groups', name: 'Soil Groups', enabled: true, active: true, mapping: {} },
  { id: 'climate_zones', name: 'Climate Zones', enabled: true, active: true, mapping: {} },
  { id: 'land_cover', name: 'Land Cover', enabled: false, active: true, mapping: {} },
];

describe('FilteringSidebarLandEnvironment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when allRasterCategories is undefined', () => {
    useAvailabilityMock.mockReturnValue({ allRasterCategories: undefined } as any);

    const { container } = render(<FilteringSidebarLandEnvironment />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a RasterFilter for each enabled and active category, soil_groups included', () => {
    useAvailabilityMock.mockReturnValue({ allRasterCategories: ALL_CATEGORIES } as any);

    render(<FilteringSidebarLandEnvironment />);

    expect(screen.getByTestId('mock-raster-filter-soil_groups')).toBeInTheDocument();
    expect(screen.getByTestId('mock-raster-filter-climate_zones')).toBeInTheDocument();
    // land_cover is disabled, so it must not render
    expect(screen.queryByTestId('mock-raster-filter-land_cover')).not.toBeInTheDocument();
  });

  it('sorts the filters alphabetically by name', () => {
    useAvailabilityMock.mockReturnValue({
      allRasterCategories: [
        { id: 'soil_groups', name: 'Soil Groups', enabled: true, active: true, mapping: {} },
        { id: 'land_cover', name: 'land cover', enabled: true, active: true, mapping: {} },
        { id: 'aez', name: 'Agro-ecological Zones', enabled: true, active: true, mapping: {} },
      ],
    } as any);

    const { container } = render(<FilteringSidebarLandEnvironment />);

    const order = Array.from(container.querySelectorAll('[data-testid^="mock-raster-filter-"]')).map(el => el.getAttribute('data-testid'));
    expect(order).toEqual(['mock-raster-filter-aez', 'mock-raster-filter-land_cover', 'mock-raster-filter-soil_groups']);
  });

  it('excludes categories that are enabled but not active', () => {
    useAvailabilityMock.mockReturnValue({
      allRasterCategories: [{ id: 'climate_zones', name: 'Climate Zones', enabled: true, active: false, mapping: {} }],
    } as any);

    render(<FilteringSidebarLandEnvironment />);

    expect(screen.queryByTestId('mock-raster-filter-climate_zones')).not.toBeInTheDocument();
  });
});
