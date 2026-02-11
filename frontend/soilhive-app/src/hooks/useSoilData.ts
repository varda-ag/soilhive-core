import type { SoilDataParameters, SoilDataSample } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';
import { useState } from 'react';

export function useSoilData(parameters: SoilDataParameters) {
  const [allData, setAllData] = useState();

  const debouncedParameters = useDebounce(parameters, 300);
  const { datasets, filterId, limit, cursor, sort } = debouncedParameters;

  const queryParameters: [string, string][] = [
    ['datasets', datasets.join(',')],
    ['limit', `${limit}`],
  ];
  if (filterId) {
    queryParameters.push(['filterId', filterId]);
  }
  if (cursor) {
    queryParameters.push(['cursor', cursor]);
  }
  if (sort) {
    queryParameters.push(['sort', sort]);
  }

  const { data, isLoading } = useApiQuery<SoilDataSample[]>({
    endpoint: `/soil-data`,
    method: 'GET',
    queryKey: ['soil-data'],
    parameters: queryParameters,
    enabled: true,
  });

  return { data, isLoading, allData };
}

// export function useSoilData(parameters: SoilDataParameters) {
//   const [allData, setAllData] = useState();

//   const debouncedParameters = useDebounce(parameters, 300);
//   const { datasets, filterId, limit, cursor, sort } = debouncedParameters;

//   const queryParameters: [string, string][] = [
//     ['datasets', 'test_dataset_2328'],
//     ['limit', `${limit}`],
//   ];
//   if (filterId) {
//     queryParameters.push(['filterId', filterId]);
//   }
//   if (cursor) {
//     queryParameters.push(['cursor', cursor]);
//   }
//   if (sort) {
//     queryParameters.push(['sort', sort]);
//   }

//   const { data, isLoading } = useApiQuery<SoilDataSample[]>({
//     endpoint: `/soil-data`,
//     method: 'GET',
//     queryKey: ['soil-data'],
//     parameters: queryParameters,
//     enabled: true,
//   });

//   return { data, isLoading, allData };
// }

// export function useSoilData(parameters: SoilDataParameters) {
//   const [allData, setAllData] = useState<SoilDataSample[]>([]);
//   const [isLoading, setIsLoading] = useState(false);

//   const debouncedParameters = useDebounce(parameters, 300);
//   const { datasets, filterId, limit, cursor, sort } = debouncedParameters

//   const fetchData = async () => {
//     setIsLoading(true);

//     const queryParameters: [string, string][] = [
//       ['datasets', 'test_dataset_2328'],
//       ['limit', `${limit}`],
//     ];
//     if (filterId) {
//       queryParameters.push(['filterId', filterId]);
//     }
//     if (cursor) {
//       queryParameters.push(['cursor', cursor]);
//     }
//     if (sort) {
//       queryParameters.push(['sort', sort]);
//     }

//     const urlObj = new URL(`${BACKEND_BASE_URL}/soil-data`);
//     for (const parameter of queryParameters) {
//       urlObj.searchParams.append(parameter[0], parameter[1]);
//     }

//     try {
//       const response = await fetch(urlObj.href);
//       const newData = await response.json();
//       setAllData(prevData => [...prevData, ...newData]);
//     } catch (error) {
//       console.error("Errore nel caricamento:", error);
//     } finally {
//       setIsLoading(false);
//     }
//   }

//   useEffect(() => {
//     fetchData();
//   }, [debouncedParameters]);

//   return { data: allData, isLoading };
// }
