import type { SoilDataParameters, SoilDataSample } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDebounce } from './useDebounce';
import { useEffect, useMemo, useState } from 'react';
// import { usePrevious, usePreviousDistinct } from 'react-use';

export function useSoilData(parameters: SoilDataParameters) {
  const [allDataMap, setAllDataMap] = useState(new Map<string, SoilDataSample[]>());
  const [cursor, setCursor] = useState<string>();

  const debouncedParameters = useDebounce(parameters, 300);

  // const previousParameters = usePrevious(debouncedParameters) ?? debouncedParameters;

  const { datasets, filterId, limit, sort } = debouncedParameters;

  const queryParameters = useMemo(() => {
    const params: [string, string][] = [
      ['datasets', datasets.join(',')],
      ['limit', `${limit}`],
    ];
    if (filterId) params.push(['filterId', filterId]);
    if (cursor) params.push(['cursor', cursor]);
    if (sort) params.push(['sort', sort]);
    return params;
  }, [datasets, limit, filterId, cursor, sort]);

  // const queryParameters: [string, string][] = [
  //   ['datasets', datasets.join(',')],
  //   ['limit', `${limit}`],
  // ];
  // if (filterId) {
  //   queryParameters.push(['filterId', filterId]);
  // }
  // if (cursor) {
  //   queryParameters.push(['cursor', cursor]);
  // }
  // if (sort) {
  //   queryParameters.push(['sort', sort]);
  // }

  const { data, isLoading } = useApiQuery<SoilDataSample[]>({
    endpoint: `/soil-data`,
    method: 'GET',
    queryKey: ['soil-data', JSON.stringify(queryParameters)],
    parameters: queryParameters,
    enabled: true,
  });

  useEffect(() => {
    if (data) {
      const lastElement = data[data.length - 1];
      if (lastElement) {
        setAllDataMap(prevAllDataMap => {
          const newAllDataMap = new Map(prevAllDataMap);
          newAllDataMap.set(lastElement.cursor, data);
          return newAllDataMap;
        });
      }
    }
  }, [data, debouncedParameters]);

  // useEffect(() => {
  //   console.debug('allDataMap', allDataMap);
  // }, [allDataMap]);

  const allData = [...allDataMap.values()].flatMap(data => data);

  function loadMore() {
    const lastElement = allData[allData.length - 1];
    if (lastElement) {
      setCursor(lastElement.cursor);
    }
  }

  function reset() {
    setAllDataMap(new Map());
    setCursor(undefined);
  }

  // useEffect(() => {
  //   const { cursor: _, sort: prevSort, ...prevParams } = previousParameters;
  //   const { cursor: __, sort: curSort, ...curParams } = debouncedParameters;
  //   console.debug('previousParameters', previousParameters)
  //   console.debug('debouncedParameters', debouncedParameters)
  //   if(prevSort !== curSort || JSON.stringify(prevParams) !== JSON.stringify(curParams)) reset();
  // }, [previousParameters, debouncedParameters]);

  const hasMore = data !== undefined && data.length > 0;

  return { allData, isLoading, hasMore, loadMore, reset };
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
