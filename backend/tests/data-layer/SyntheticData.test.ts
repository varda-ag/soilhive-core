import { addSyntheticData, syntheticDataOptions } from '../mock';

describe('Synthetic data tests', () => {
  it.each([[[-7, 38, 0, 42]], [[35, 0, 40, 5]], [[0, 45, 5, 50]], [[0, 50, 5, 55]]])(
    'Creates synthetic data',
    async spatial_extent => {
      await addSyntheticData({ ...syntheticDataOptions, spatial_extent });
    },
    10000, // Timeout of 10 seconds
  );
});
