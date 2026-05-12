import { h3ResolutionForZoomLevel } from '../../src/utilities/map';

describe('Map utilities', () => {
  it('Returns expected H3 resolution', () => {
    expect(h3ResolutionForZoomLevel(0)).toBe(1);
    expect(h3ResolutionForZoomLevel(99)).toBe(14);
  });
});
