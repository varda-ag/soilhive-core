import { formatUploadSize } from '../../src/utilities/formatUploadSize';

describe('formatUploadSize', () => {
  it.each([
    [1, '1 MB'],
    [500, '500 MB'],
    [999, '999 MB'],
    [1000, '1 GB'],
    [1500, '1.5 GB'],
    [2048, '2.05 GB'],
    [10000, '10 GB'],
  ])('formatUploadSize(%i) → %s', (input, expected) => {
    expect(formatUploadSize(input)).toBe(expected);
  });
});
