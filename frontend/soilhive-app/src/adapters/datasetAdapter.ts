import type { AvailabilityDataset } from 'types/availability';
import type { FilteredDataset } from 'types/backend';

export function mapFilteredDatasetToAvailabilityDataset(dataset: FilteredDataset): AvailabilityDataset {
  return {
    id: dataset.id,
    name: dataset.id, // TODO: name will come
    views: '0', // TODO: views not supported at the moment
    tags: [], // TODO: tags not supported at the moment
    properties: {
      points: dataset.dataset_layer_count,
      layers: 0, // TODO: raster not supported at the moment
      minDepth: dataset.min_depth ?? 0,
      maxDepth: dataset.max_depth ?? 0,
      dateStart: dataset.min_sampling_date ? Number(dataset.min_sampling_date) : 0,
      dateEnd: dataset.max_sampling_date ? Number(dataset.max_sampling_date) : 0,
    },
  };
}
