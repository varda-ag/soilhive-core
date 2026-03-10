import { buildApiUrl } from '../../src/utilities/buildApiUrl';
import { BACKEND_BASE_URL } from '../../src/configuration/api';

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'https://test-api.url',
}));

describe('buildApiUrl', () => {
  it('returns base url + endpoint when parameters are not provided', () => {
    expect(buildApiUrl('/test')).toBe(`${BACKEND_BASE_URL}/test`);
  });

  it('returns base url + endpoint when parameters are an empty array', () => {
    expect(buildApiUrl('/test', [])).toBe(`${BACKEND_BASE_URL}/test`);
  });

  it('appends a single query parameter', () => {
    expect(buildApiUrl('/test', [['status', 'created']])).toBe(`${BACKEND_BASE_URL}/test?status=created`);
  });

  it('appends multiple query parameters', () => {
    expect(
      buildApiUrl('/test', [
        ['status', 'created'],
        ['page', '2'],
      ]),
    ).toBe(`${BACKEND_BASE_URL}/test?status=created&page=2`);
  });
});
