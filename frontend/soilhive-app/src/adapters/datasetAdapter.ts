import type { AvailabilityDataset } from 'types/availability';
import type { FilteredDataset } from 'types/backend';

export const getYear = (dateString?: string): number => {
  if (!dateString) return 0;
  const date = new Date(dateString);
  return date.getFullYear();
};

export function mapFilteredDatasetToAvailabilityDataset(dataset: FilteredDataset): AvailabilityDataset {
  return {
    id: dataset.id,
    name: dataset.name, // TODO: name will come
    views: '0', // TODO: views not supported at the moment
    tags: [], // TODO: tags not supported at the moment
    properties: {
      points: dataset.dataset_layer_count,
      layers: 0, // TODO: raster not supported at the moment
      minDepth: dataset.min_depth ?? 0,
      maxDepth: dataset.max_depth ?? 0,
      dateStart: getYear(dataset.min_sampling_date),
      dateEnd: getYear(dataset.max_sampling_date),
    },
  };
}
