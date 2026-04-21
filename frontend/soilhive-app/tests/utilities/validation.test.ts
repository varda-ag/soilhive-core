import { isEmptyString, allArraysMatch } from '../../src/utilities/validation';

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

describe('allArraysMatch', () => {
  it('returns true for empty list', () => {
    expect(allArraysMatch([])).toBe(true);
  });

  it('returns true for a single array', () => {
    expect(allArraysMatch([['a', 'b']])).toBe(true);
  });

  it('returns true when all entries are undefined', () => {
    expect(allArraysMatch([undefined, undefined])).toBe(true);
  });

  it('returns true when only one entry is defined', () => {
    expect(allArraysMatch([['a'], undefined])).toBe(true);
  });

  it('returns true when all arrays share the same values', () => {
    expect(
      allArraysMatch([
        ['a', 'b'],
        ['a', 'b'],
      ]),
    ).toBe(true);
  });

  it('returns true when values match regardless of order', () => {
    expect(
      allArraysMatch([
        ['b', 'a'],
        ['a', 'b'],
      ]),
    ).toBe(true);
  });

  it('returns false when arrays have different values', () => {
    expect(
      allArraysMatch([
        ['a', 'b'],
        ['a', 'c'],
      ]),
    ).toBe(false);
  });

  it('returns false when arrays have different lengths', () => {
    expect(
      allArraysMatch([
        ['a', 'b'],
        ['a', 'b', 'c'],
      ]),
    ).toBe(false);
  });

  it('ignores undefined entries when checking consistency', () => {
    expect(allArraysMatch([['a', 'b'], undefined, ['a', 'b']])).toBe(true);
  });
});
