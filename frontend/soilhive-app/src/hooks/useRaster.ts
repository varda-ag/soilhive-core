import { useRequest } from '../api-client';
//import type { RasterFilterCategory } from '../types/backend';
import { BACKEND_BASE_URL } from '../utilities/environmentVariables';
import { useQuery } from '@tanstack/react-query';

// Mock data until endpoint is ready
/*const MOCK_RASTER_FILTERS: RasterFilterCategory[] = [
  {
    id: 'agroecological_zones',
    name: 'Agroecological Zones',
    description: 'Zones defined by climate, soil and landform',
    enabled: false,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Boreal: 4 },
  },
  {
    id: 'land_cover',
    name: 'Land cover',
    description: 'Physical material at the surface of the earth',
    enabled: false,
    mapping: { Forest: 1, Grassland: 2, Cropland: 3, Wetland: 4 },
  },
  {
    id: 'soil_groups',
    name: 'Soil Groups',
    description: 'World Reference Base for Soil Resources',
    enabled: true,
    mapping: { Acrisols: 1, Ferralsols: 2, Gleysols: 3, Leptosols: 4 },
  },
  {
    id: 'climate_zones',
    name: 'Climate Zones',
    description: 'Köppen climate classification',
    enabled: true,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Continental: 4, Polar: 5 },
  },
];*/
export function useRaster() {
  const { request } = useRequest();
  // Load all raster filters (regardless of category)
  const { data: allCategories, isLoading } = useQuery({
    queryKey: ['rasterFilters'],
    queryFn: () =>
      request({
        url: `${BACKEND_BASE_URL}/raster-filters`,
        method: 'GET',
      }),
    /*queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return MOCK_RASTER_FILTERS;
    },*/
  });

  return {
    allCategories,
    isLoading,
  };
}
