import { isEmptyString } from '../../src/utilities/validation';

describe('isEmptyString', () => {
  it.each([
    ['', true],
    ['   ', true],
    ['\t', true],
    ['\n', true],
    ['a', false],
    ['  hello  ', false],
    ['0', false],
  ])('isEmptyString(%j) → %s', (input, expected) => {
    expect(isEmptyString(input)).toBe(expected);
  });
});
