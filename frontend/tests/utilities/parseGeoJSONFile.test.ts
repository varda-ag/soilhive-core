import { parseGeoJSONFile } from '../../src/utilities/parseGeoJSONFile';
import { check } from '@placemarkio/check-geojson';

jest.mock('@placemarkio/check-geojson', () => ({
  check: jest.fn(),
}));

const checkMock = check as jest.MockedFunction<typeof check>;

function makeFile(content: string): File {
  return { text: () => Promise.resolve(content) } as unknown as File;
}

const POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
} as const;
const MULTI_POLYGON = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  ],
} as const;

describe('parseGeoJSONFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns cant-read-file error when file content is empty', async () => {
    const result = await parseGeoJSONFile(makeFile(''));
    expect(result).toEqual({ error: { id: 'cant-read-file', message: expect.any(String) } });
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('returns invalid-json error when check() throws', async () => {
    checkMock.mockImplementation(() => {
      throw new Error('not valid GeoJSON');
    });
    const result = await parseGeoJSONFile(makeFile('not valid json'));
    expect(result).toEqual({ error: { id: 'invalid-json', message: expect.any(String) } });
  });

  describe('direct geometry', () => {
    it('returns polygon for a Polygon geometry', async () => {
      checkMock.mockReturnValue(POLYGON as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(POLYGON)));
      expect(result).toEqual({ polygon: POLYGON });
    });

    it('returns polygon for a MultiPolygon geometry', async () => {
      checkMock.mockReturnValue(MULTI_POLYGON as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(MULTI_POLYGON)));
      expect(result).toEqual({ polygon: MULTI_POLYGON });
    });

    it('returns invalid-polygon error for a Point geometry', async () => {
      const point = { type: 'Point', coordinates: [0, 0] };
      checkMock.mockReturnValue(point as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(point)));
      expect(result).toEqual({ error: { id: 'invalid-polygon', message: expect.any(String) } });
    });
  });

  describe('Feature', () => {
    it('returns polygon when Feature contains a Polygon geometry', async () => {
      const feature = { type: 'Feature', geometry: POLYGON, properties: {} };
      checkMock.mockReturnValue(feature as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(feature)));
      expect(result).toEqual({ polygon: POLYGON });
    });

    it('returns polygon when Feature contains a MultiPolygon geometry', async () => {
      const feature = { type: 'Feature', geometry: MULTI_POLYGON, properties: {} };
      checkMock.mockReturnValue(feature as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(feature)));
      expect(result).toEqual({ polygon: MULTI_POLYGON });
    });

    it('returns invalid-polygon error when Feature contains a non-polygon geometry', async () => {
      const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} };
      checkMock.mockReturnValue(feature as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(feature)));
      expect(result).toEqual({ error: { id: 'invalid-polygon', message: expect.any(String) } });
    });
  });

  describe('FeatureCollection', () => {
    it('returns the first Polygon found among features', async () => {
      const fc = {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
          { type: 'Feature', geometry: POLYGON, properties: {} },
          { type: 'Feature', geometry: MULTI_POLYGON, properties: {} },
        ],
      };
      checkMock.mockReturnValue(fc as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(fc)));
      expect(result).toEqual({ polygon: POLYGON });
    });

    it('returns a MultiPolygon when it is the first polygon-type feature', async () => {
      const fc = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: MULTI_POLYGON, properties: {} }],
      };
      checkMock.mockReturnValue(fc as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(fc)));
      expect(result).toEqual({ polygon: MULTI_POLYGON });
    });

    it('returns invalid-polygon error when no feature has a polygon geometry', async () => {
      const fc = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
      };
      checkMock.mockReturnValue(fc as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(fc)));
      expect(result).toEqual({ error: { id: 'invalid-polygon', message: expect.any(String) } });
    });

    it('returns invalid-polygon error for an empty FeatureCollection', async () => {
      const fc = { type: 'FeatureCollection', features: [] };
      checkMock.mockReturnValue(fc as any);
      const result = await parseGeoJSONFile(makeFile(JSON.stringify(fc)));
      expect(result).toEqual({ error: { id: 'invalid-polygon', message: expect.any(String) } });
    });
  });
});
