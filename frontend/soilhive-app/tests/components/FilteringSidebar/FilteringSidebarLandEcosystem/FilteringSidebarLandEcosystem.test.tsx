//import React from 'react';
import { render, screen } from '@testing-library/react';
import { FilteringSidebarLandEcosystem } from 'components/FilteringSidebar/FilteringSidebarLandEcosystem/FilteringSidebarLandEcosystem';
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
  { id: 'soil_groups', name: 'Soil Groups', enabled: true, mapping: {} },
  { id: 'climate_zones', name: 'Climate Zones', enabled: true, mapping: {} },
  { id: 'land_cover', name: 'Land Cover', enabled: false, mapping: {} },
];

describe('FilteringSidebarLandEcosystem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when allRasterCategories is undefined', () => {
    useAvailabilityMock.mockReturnValue({ allRasterCategories: undefined } as any);

    const { container } = render(<FilteringSidebarLandEcosystem />);

    expect(container).toBeEmptyDOMElement();
  });

  it('excludes soil_groups from the rendered filters', () => {
    useAvailabilityMock.mockReturnValue({ allRasterCategories: ALL_CATEGORIES } as any);

    render(<FilteringSidebarLandEcosystem />);

    expect(screen.queryByTestId('mock-raster-filter-soil_groups')).not.toBeInTheDocument();
  });

  it('renders a RasterFilter for each category except soil_groups', () => {
    useAvailabilityMock.mockReturnValue({
      allRasterCategories: ALL_CATEGORIES,
      isLoadingRasterCategories: false,
      geometryFilterResults: [{ raster_filters: { climate_zones: [1], land_cover: [2] } }],
    } as any);

    render(<FilteringSidebarLandEcosystem />);

    expect(screen.getByTestId('mock-raster-filter-climate_zones')).toBeInTheDocument();
    expect(screen.getByTestId('mock-raster-filter-land_cover')).toBeInTheDocument();
  });
  it('renders nothing when all categories are soil_groups', () => {
    useAvailabilityMock.mockReturnValue({
      allRasterCategories: [{ id: 'soil_groups', name: 'Soil Groups', enabled: true, mapping: {} }],
    } as any);

    const { container } = render(<FilteringSidebarLandEcosystem />);

    expect(container).toBeEmptyDOMElement();
  });
});
