import { isEmptyString, arraysMatch, hasTextContent } from '../../src/utilities/validation';

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

describe('hasTextContent', () => {
  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    ['   ', false],
    ['<p></p>', false],
    ['<p><br/></p>', false],
    ['<div><span></span></div>', false],
    ['<p>Hello</p>', true],
    ['<div><span>a</span></div>', true],
    ['<p>  text  </p>', true],
  ])('hasTextContent(%j) → %s', (input, expected) => {
    expect(hasTextContent(input as string | null | undefined)).toBe(expected);
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

  it('does not false-positive when field names contain commas', () => {
    expect(arraysMatch(['a,b', 'c'], ['a', 'b,c'])).toBe(false);
  });
});
