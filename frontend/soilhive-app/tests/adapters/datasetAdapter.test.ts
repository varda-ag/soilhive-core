import type { AvailabilityDataset } from 'types/availability';
import type { FilteredDataset } from 'types/backend';
import { mapFilteredDatasetToAvailabilityDataset } from '../../src/adapters';

describe('mapFilteredDatasetToAvailabilityDataset adapter', () => {
  it('should adapt empty object', () => {
    // Arrange
    const filteredDataset: FilteredDataset = {
      id: 'dataset-1',
      dataset_layer_count: 0,
    };

    const expectedAvailabilityDataset: AvailabilityDataset = {
      id: 'dataset-1',
      name: 'dataset-1',
      views: '0',
      tags: [],
      properties: {
        points: 0,
        layers: 0,
        minDepth: 0,
        maxDepth: 0,
        dateStart: 0,
        dateEnd: 0,
      },
    };

    // Act
    const actualAvailabilityDataset = mapFilteredDatasetToAvailabilityDataset(filteredDataset);

    expect(actualAvailabilityDataset).toEqual(expectedAvailabilityDataset);
  });

  it('shuold adapt valid object', () => {
    // Arrange
    const filteredDataset: FilteredDataset = {
      id: 'dataset-2',
      dataset_layer_count: 10,
      min_depth: 10,
      max_depth: 20,
      min_sampling_date: '2023',
      max_sampling_date: '2025',
    };

    const expectedAvailabilityDataset: AvailabilityDataset = {
      id: 'dataset-2',
      name: 'dataset-2',
      views: '0',
      tags: [],
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
