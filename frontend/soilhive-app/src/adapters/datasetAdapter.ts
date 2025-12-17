import type { FilteredDataset } from 'hooks/useDatasetFilter';
import type { AvailabilityDataset } from 'types/availability';

export function mapFilteredDatasetToAvailabilityDataset(dataset: FilteredDataset): AvailabilityDataset {
  return {
    id: dataset.id,
    name: dataset.id, // TODO: name will come
    views: 'N/A', // TODO: views not supported at the moment
    tags: [], // TODO: tags not supported at the moment
    properties: {
      points: dataset.feature_count,
      layers: 0, // TODO: raster not supported at the moment
      minDepth: dataset.min_depth ?? 0,
      maxDepth: dataset.max_depth ?? 0,
      dateStart: dataset.min_sampling_date ? new Date(dataset.min_sampling_date).getFullYear() : 0,
      dateEnd: dataset.max_sampling_date ? new Date(dataset.max_sampling_date).getFullYear() : 0,
    },
  };
}
