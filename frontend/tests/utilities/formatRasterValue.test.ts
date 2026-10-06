import { formatRasterValue } from '../../src/utilities/formatRasterValue';

describe('formatRasterValue', () => {
  it.each([
    [Math.fround(6.2869), 6.2869], // a Float32 pixel, widened
    [Math.fround(-3.14159), -3.14159],
    [12345678, 12345678], // integers keep every digit
    [12, 12], // a class code
    [0.000123456789, 0.0001234568],
  ])('formatRasterValue(%p) → %p', (input, expected) => {
    expect(formatRasterValue(input)).toBe(expected);
  });
});
