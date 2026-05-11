import type { SoilPropertyCategory } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export function usePropertiesCategories() {
  return useApiQuery<SoilPropertyCategory[]>({
    endpoint: '/soil-property-categories',
    method: 'GET',
    queryKey: ['soil-property-categories'],
    enabled: true,
  });
}
