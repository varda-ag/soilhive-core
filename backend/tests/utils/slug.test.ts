import { describe, it, expect } from '@jest/globals';
import { getNewPath } from '../../src/utils/slug';

describe('getNewPath', () => {
  it('should replace the old slug with the new slug in a simple path', () => {
    const originalUrl = '/api/datasets/old-dataset-name';
    const oldSlug = 'old-dataset-name';
    const newSlug = 'new-shiny-dataset';

    const result = getNewPath(originalUrl, oldSlug, newSlug);

    expect(result).toBe('/api/datasets/new-shiny-dataset');
  });

  it('should preserve query parameters when replacing the slug', () => {
    const originalUrl = '/api/datasets/old-slug?version=1&sort=desc';
    const oldSlug = 'old-slug';
    const newSlug = 'new-slug';

    const result = getNewPath(originalUrl, oldSlug, newSlug);

    expect(result).toBe('/api/datasets/new-slug?version=1&sort=desc');
  });
});
