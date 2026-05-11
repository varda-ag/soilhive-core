import type { SoilDataParameters, SoilDataSample } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useEffect, useMemo, useState } from 'react';

export function useSoilData(parameters: SoilDataParameters) {
  const [allDataMap, setAllDataMap] = useState(new Map<string, SoilDataSample[]>());
  const [cursor, setCursor] = useState<string>();
  const { selectedDatasets, availableDatasets, filterId, limit, sort } = parameters;

  const datasets = selectedDatasets ?? availableDatasets;

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

  const { data = [], isLoading } = useApiQuery<SoilDataSample[]>({
    endpoint: `/soil-data`,
    method: 'GET',
    queryKey: ['soil-data', queryParameters, selectedDatasets],
    parameters: queryParameters,
    // The query gets executed only if there are available datasets
    // otherwise the API would return an error.
    enabled: datasets.length > 0 && filterId !== undefined,
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
  }, [data]);

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

  const hasMore = data !== undefined && data.length > 0;

  return { allData, isLoading, hasMore, loadMore, reset };
}
