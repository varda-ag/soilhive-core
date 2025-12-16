import { useCallback, useEffect, useRef, useState } from 'react';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import { Polygon, MultiPolygon } from 'geojson';

export function useDatasetFilter(filter: DatasetFilter) {
  const [data, setData] = useState<PostDatasetFilterResponse>();
  const abortControllerRef = useRef<AbortController>(null);
  const { request, loading, error } = useRequest();

  const fetchDatasets = useCallback(
    async (filter: DatasetFilter) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      try {
        const res = await request({
          url: `${BACKEND_BASE_URL}/datasets-filters`,
          method: 'POST',
          body: filter,
          signal: abortControllerRef.current.signal,
        });
        setData(res);
        return res;
      } catch (err) {
        // Don't set error if it was aborted
        if (err instanceof Error) {
          if (err.name !== 'AbortError') throw err;
        } else {
          throw err;
        }
      }
    },
    [request, filter],
  );

  useEffect(() => {
    if (!filter) return;

    // debounce
    const timeoutId = setTimeout(() => {
      fetchDatasets(filter);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchDatasets, filter]);

  return {
    data,
    loading,
    error,
  };
}

export interface FilterableDatasetMetadata {
  data_types?: string[];
  licenses?: string[];
  min_sampling_date?: string;
  max_sampling_date?: string;
  min_depth?: number;
  max_depth?: number;
  horizons?: string[];
  soil_properties?: string[];
  agroecological_zones?: string[];
  land_cover?: string[];
  soil_groups?: string[];
}

export interface DatasetFilter {
  geometries: (Polygon | MultiPolygon)[];
  parameters: FilterableDatasetMetadata;
}

export interface StoredDatasetFilter extends DatasetFilter {
  id: string;
  name: string;
}

export interface FilteredDataset extends FilterableDatasetMetadata {
  id: string;
  feature_count: number;
}

export interface ResultItem {
  datasets: FilteredDataset[];
}

export interface PostDatasetFilterResponse extends StoredDatasetFilter {
  results: ResultItem[];
}
