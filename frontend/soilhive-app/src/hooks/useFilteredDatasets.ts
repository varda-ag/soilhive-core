import type { DatasetFilter } from 'types/backend';
import { useCreateDataFilter } from './useCreateDataFilter';
import { useDataFilterCoverage } from './useDataFilterCoverage';

export function useFilteredDatasets(filters: DatasetFilter) {
  const { data: filterData } = useCreateDataFilter(filters);
  const coverageQuery = useDataFilterCoverage(filterData?.id);

  return coverageQuery;
}
