import type { AvailabilityDataset, TimeFilterState } from 'types/availability';
import type { FilteredDataset, FilteredDatasetSummary } from 'types/backend';

export const getYear = (dateString?: string | null): number | undefined => {
  if (!dateString) return undefined;
  const [datePart] = dateString.split('T');
  const [year] = datePart.split('-').map(Number);
  if (isNaN(year)) return undefined;
  return year;
};

export const yearRangeToDatasetFilters = ({ min, max }: TimeFilterState) => {
  const toReturn = {
    min_sampling_date: min ? `${min}-01-01` : undefined,
    max_sampling_date: max ? `${max}-12-31` : undefined,
  };
  return toReturn;
};

export function mapFilteredDatasetToAvailabilityDataset(dataset: FilteredDataset): AvailabilityDataset {
  return {
    id: dataset.id,
    name: dataset.name,
    views: '0', // TODO: views not supported at the moment
    tags: [], // TODO: tags not supported at the moment
    dataType: dataset.data_type,
    properties: {},
  };
}

export function mapFilteredDatasetSummaryToAvailabilityDataset(dataset: FilteredDatasetSummary): AvailabilityDataset {
  return {
    id: dataset.id,
    name: dataset.name,
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
    h3_point_aggregation: dataset.h3_point_aggregation,
  };
}
