import { sanitizeField } from '../../src/utilities/dataMapping';

describe('sanitizeField', () => {
  describe('default mode (removeSpacePlaceholders = false)', () => {
    it('lowercases the input', () => {
      expect(sanitizeField('HELLO')).toBe('hello');
    });

    it('replaces hyphens with underscores', () => {
      expect(sanitizeField('foo-bar')).toBe('foo_bar');
    });

    it('keeps letters, digits, and underscores', () => {
      expect(sanitizeField('abc_123')).toBe('abc_123');
    });

    it('removes characters that are not letters, digits, or underscores', () => {
      expect(sanitizeField('hello world!')).toBe('helloworld');
    });

    it('handles multiple hyphens', () => {
      expect(sanitizeField('a-b-c')).toBe('a_b_c');
    });

    it('removes special characters but keeps underscores from hyphen replacement', () => {
      expect(sanitizeField('pH(H2O)')).toBe('phh2o');
    });

    it('returns an empty string for an empty input', () => {
      expect(sanitizeField('')).toBe('');
    });

    it('returns an empty string if all characters are stripped', () => {
      expect(sanitizeField('!!!')).toBe('');
    });
  });

  describe('removeSpacePlaceholders = true', () => {
    it('keeps only lowercase letters', () => {
      expect(sanitizeField('hello', true)).toBe('hello');
    });

    it('removes digits', () => {
      expect(sanitizeField('abc123', true)).toBe('abc');
    });

    it('removes underscores', () => {
      expect(sanitizeField('foo_bar', true)).toBe('foobar');
    });

    it('removes hyphens (after converting to underscore, which is then stripped)', () => {
      expect(sanitizeField('foo-bar', true)).toBe('foobar');
    });

    it('removes all non-letter characters', () => {
      expect(sanitizeField('pH(H2O)', true)).toBe('phho');
    });

    it('returns an empty string for digits-only input', () => {
      expect(sanitizeField('123', true)).toBe('');
    });
  });
});
