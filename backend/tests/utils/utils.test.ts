import { describe, it, expect } from '@jest/globals';
import { replaceExtension } from '../../src/utils/utils';

describe('utils tests', () => {
  it.each([
    ['', '.test'],
    ['a', 'a.test'],
    ['a.tmp', 'a.test'],
    ['a.one.two', 'a.one.test'],
    ['/this/is/a/path/', '/this/is/a/path.test'],
    ['/this/is/a/path/a.one.two', '/this/is/a/path/a.one.test'],
    ['\\this\\is\\a\\path\\a.one.two', '\\this\\is\\a\\path\\a.one.test'],
  ])('replaceExtension should work as expected', (input, expected) => {
    expect(replaceExtension(input, 'test')).toEqual(expected);
  });
});
