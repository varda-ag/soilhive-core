import { useQuery } from '@tanstack/react-query';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import type { SoilProperty } from '../types/backend';

export function useSoilProperties() {
  const { request } = useRequest();

  const fetchSoilProperties = async (): Promise<SoilProperty[]> => {
    const res = await request({
      url: `${BACKEND_BASE_URL}/soil-properties`,
      method: 'GET',
    });
    return res;
  };

  return useQuery({
    queryKey: ['soilProperties'],
    queryFn: fetchSoilProperties,
  });
}
