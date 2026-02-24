import { useQuery } from '@tanstack/react-query';
import type { RasterFilterCategory } from '../types/backend';

// Mock data until endpoint is ready
const MOCK_RASTER_FILTERS: RasterFilterCategory[] = [
  {
    id: 'agroecological_zones',
    name: 'Agroecological Zones',
    description: 'Zones defined by climate, soil and landform',
    enabled: true,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Boreal: 4 },
  },
  {
    id: 'land_cover',
    name: 'Land Cover',
    description: 'Physical material at the surface of the earth',
    enabled: true,
    mapping: { Forest: 1, Grassland: 2, Cropland: 3, Wetland: 4, Settlement: 5 },
  },
  {
    id: 'soil_groups',
    name: 'Soil Groups',
    description: 'World Reference Base for Soil Resources',
    enabled: true,
    mapping: { Acrisols: 1, Ferralsols: 2, Gleysols: 3, Leptosols: 4 },
  },
];

export function useRasterFilters() {
  return useQuery({
    queryKey: ['rasterFilters'],
    queryFn: async () => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return MOCK_RASTER_FILTERS;
    },
  });
}
