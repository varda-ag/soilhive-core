import type { AvailabilityDataset, TimeFilterState } from 'types/availability';
import type { FilteredDataset } from 'types/backend';

export const getYear = (dateString?: string | null): number | undefined => {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  return date.getFullYear();
};

export const yearRangeToDatasetFilters = ({ min, max }: TimeFilterState) => {
  return {
    // Date format e.g. "2024-05-22"
    min_sampling_date: min ? new Date(min, 0, 1).toLocaleDateString('en-CA') : undefined,
    max_sampling_date: max ? new Date(max, 11, 31, 23, 59, 59, 999).toLocaleDateString('en-CA') : undefined,
  };
};

export function mapFilteredDatasetToAvailabilityDataset(dataset: FilteredDataset): AvailabilityDataset {
  return {
    id: dataset.id,
    name: dataset.name, // TODO: name will come
    views: '0', // TODO: views not supported at the moment
    tags: [], // TODO: tags not supported at the moment
    dataType: dataset.data_type,
    properties: {
      points: dataset.dataset_layer_count,
      layers: 0, // TODO: raster not supported at the moment
      minDepth: dataset.min_depth,
      maxDepth: dataset.max_depth,
      dateStart: getYear(dataset.min_sampling_date),
      dateEnd: getYear(dataset.max_sampling_date),
    },
  };
}
