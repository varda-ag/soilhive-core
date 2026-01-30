import type { AvailabilityDataset } from 'types/availability';
import type { FilteredDataset } from 'types/backend';
import { mapFilteredDatasetToAvailabilityDataset, yearRangeToDatasetFilters } from '../../src/adapters';

describe('mapFilteredDatasetToAvailabilityDataset adapter', () => {
  it('should adapt empty object', () => {
    // Arrange
    const filteredDataset: FilteredDataset = {
      id: 'dataset-1',
      name: 'dataset-name-1',
      dataset_layer_count: 0,
    };

    const expectedAvailabilityDataset: AvailabilityDataset = {
      id: 'dataset-1',
      name: 'dataset-name-1',
      views: '0',
      tags: [],
      properties: {
        points: 0,
        layers: 0,
        minDepth: undefined,
        maxDepth: undefined,
        dateStart: undefined,
        dateEnd: undefined,
      },
    };

    // Act
    const actualAvailabilityDataset = mapFilteredDatasetToAvailabilityDataset(filteredDataset);

    expect(actualAvailabilityDataset).toEqual(expectedAvailabilityDataset);
  });

  it('should adapt valid object', () => {
    // Arrange
    const filteredDataset: FilteredDataset = {
      id: 'dataset-2',
      name: 'dataset-name-2',
      dataset_layer_count: 10,
      min_depth: 10,
      max_depth: 20,
      min_sampling_date: '2023',
      max_sampling_date: '2025',
      data_type: 'point',
    };

    const expectedAvailabilityDataset: AvailabilityDataset = {
      id: 'dataset-2',
      name: 'dataset-name-2',
      views: '0',
      tags: [],
      dataType: 'point',
      properties: {
        points: 10,
        layers: 0,
        minDepth: 10,
        maxDepth: 20,
        dateStart: 2023,
        dateEnd: 2025,
      },
    };

    // Act
    const actualAvailabilityDataset = mapFilteredDatasetToAvailabilityDataset(filteredDataset);

    // Assert
    expect(actualAvailabilityDataset).toEqual(expectedAvailabilityDataset);
  });
});

describe('yearRangeToDatasetFilters', () => {
  it('converts years range to dataset dates', () => {
    const dates = yearRangeToDatasetFilters({ min: 1990, max: 2025 });
    expect(new Date(dates.min_sampling_date).getFullYear()).toEqual(1990);
    expect(new Date(dates.max_sampling_date).getFullYear()).toEqual(2025);
  });
});
