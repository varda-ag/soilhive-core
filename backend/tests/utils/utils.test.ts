import { describe, it, expect } from '@jest/globals';
import { buildDatedFileKey, mergeMax, replaceExtension } from '../../src/utils/utils';

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

  describe('buildDatedFileKey', () => {
    it('builds a year/month prefixed key with millisecond precision', () => {
      const key = buildDatedFileKey('sample point.geojson', new Date('2026-07-27T12:34:56.789Z'));
      expect(key).toBe('2026/07/2026-07-27T12-34-56-789_sample_point.geojson');
    });

    it('zero-pads milliseconds so keys stay fixed width and sortable', () => {
      const key = buildDatedFileKey('a.csv', new Date('2026-07-27T12:34:56.000Z'));
      expect(key).toBe('2026/07/2026-07-27T12-34-56-000_a.csv');
    });

    it('distinguishes uploads of the same filename within the same second', () => {
      // file_path is UNIQUE, so colliding keys surface as a 409 on parallel uploads.
      const first = buildDatedFileKey('data.csv', new Date('2026-07-27T12:34:56.001Z'));
      const second = buildDatedFileKey('data.csv', new Date('2026-07-27T12:34:56.002Z'));
      expect(first).not.toEqual(second);
    });
  });

  describe('mergeMax', () => {
    // Partial dates: the max is the one whose period ends last
    it.each([
      ['2015', '2015-06-01', '2015'],
      ['2015-06-01', '2015', '2015'],
      ['2015-06', '2015-06-15', '2015-06'],
      ['2015-05', '2015-06-01', '2015-06-01'],
      ['2014', '2015-01-01', '2015-01-01'],
      [null, '2015', '2015'],
      ['2015', null, '2015'],
      [null, null, null],
    ])('mergeMax(%p, %p) is %p', (a, b, expected) => {
      expect(mergeMax(a, b)).toBe(expected);
    });
  });
});
