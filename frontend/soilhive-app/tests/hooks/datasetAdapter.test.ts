import type { AvailabilityDataset } from 'types/availability';
import type { FilteredDataset } from 'types/backend';
import { mapFilteredDatasetToAvailabilityDataset } from '../../src/adapters';

describe('mapFilteredDatasetToAvailabilityDataset adapter', () => {
  it('should adapt valid object', () => {
    // Arrange
    const filteredDataset: FilteredDataset = {
      id: 'dataset-1',
      feature_count: 0,
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
});
