import { isEmptyString, arraysMatch } from '../../src/utilities/validation';

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

describe('arraysMatch', () => {
  it('returns true for identical arrays', () => {
    expect(arraysMatch(['a', 'b'], ['a', 'b'])).toBe(true);
  });

  it('returns true regardless of order', () => {
    expect(arraysMatch(['b', 'a'], ['a', 'b'])).toBe(true);
  });

  it('returns false when values differ', () => {
    expect(arraysMatch(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(arraysMatch(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });

  it('returns true for two empty arrays', () => {
    expect(arraysMatch([], [])).toBe(true);
  });
});
