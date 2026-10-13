import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readMockSoilIndexData } from '../../../src/jobs/soil-indexes/mockSoilIndexData';
import { MOCK_HEADER, mockCsv, mockDataServer, mockRow } from './mockDataServer';

const server = mockDataServer();

const refused = (promise: Promise<unknown>, detail: string | RegExp) =>
  expect(promise).rejects.toMatchObject({
    code: 'SI_MOCK_DATA_UNAVAILABLE',
    detail: typeof detail === 'string' ? expect.stringContaining(detail) : expect.stringMatching(detail),
  });

describe('readMockSoilIndexData', () => {
  beforeAll(() => server.start());
  afterAll(() => server.stop());

  describe('rows', () => {
    it('reads columns by position: index_value to 3 decimals, the rest except geometry and year as metadata', async () => {
      server.serve(mockCsv(mockRow({})));

      await expect(readMockSoilIndexData(server.url())).resolves.toEqual([
        {
          id: 1,
          lon: 6.945976106,
          lat: 45.031779109,
          year: 2001,
          value: 173.947,
          metadata: {
            id: 1,
            min_depth_cm: 30,
            max_depth_cm: 60,
            clay_pct: 13.2,
            sand_pct: 53.8,
            silt_pct_calc: 33,
            usda_texture: 'Sandy Loam',
            som_g_kg: 77.6,
            ph_h2o: 7.6,
            p_mg_kg: 195,
            k_cmolc_kg: 0.44,
            ca_cmolc_kg: 15.81,
            mg_cmolc_kg: 2.51,
            model_texture_class: 1,
            model_som_pct: 7.76,
            model_ph: 7.6,
            model_p_ppm: 195,
            model_k_ppm: 171.6,
            model_ca_ppm: 3162,
            model_mg_ppm: 301.2,
            model_csc_meq_100g: 18.76,
            model_herb: 1,
            model_nema: 1,
          },
        },
      ]);
    });

    it('omits empty cells from metadata and keeps text in a numeric column as text', async () => {
      server.serve(mockCsv(mockRow({ clay_pct: '', ph_h2o: 'n/a' })));

      const [row] = await readMockSoilIndexData(server.url());
      expect(row!.metadata).not.toHaveProperty('clay_pct');
      expect(row!.metadata['ph_h2o']).toBe('n/a');
    });

    it('accepts a byte order mark, CRLF line endings and quoted commas, keeping file order', async () => {
      server.serve(`\ufeff${[MOCK_HEADER, mockRow({ id: 2, usda_texture: '"Loam, sandy"' }), mockRow({ id: 1 })].join('\r\n')}\r\n`);

      const rows = await readMockSoilIndexData(server.url());
      expect(rows.map(row => row.id)).toEqual([2, 1]);
      expect(rows[0]!.metadata['usda_texture']).toBe('Loam, sandy');
    });

    it('reads a header with no rows as no rows', async () => {
      server.serve(mockCsv());

      await expect(readMockSoilIndexData(server.url())).resolves.toEqual([]);
    });
  });

  describe('refuses the file', () => {
    it('when a header column is out of place, naming it', async () => {
      server.serve(`${MOCK_HEADER.replace('index_value,clay_pct', 'clay_pct,index_value')}\n${mockRow({})}\n`);

      await refused(readMockSoilIndexData(server.url()), 'header column 8 is "clay_pct", expected "index_value"');
    });

    it('when the header has an extra column', async () => {
      server.serve(`${MOCK_HEADER},extra\n`);

      await refused(readMockSoilIndexData(server.url()), 'header has 29 columns, expected 28');
    });

    it('when it is empty', async () => {
      server.serve('');

      await refused(readMockSoilIndexData(server.url()), 'empty file');
    });

    it('when a row has the wrong number of fields', async () => {
      server.serve(mockCsv(mockRow({}), `${mockRow({ id: 2 })},extra`));

      await refused(readMockSoilIndexData(server.url()), 'line 3: 29 fields, expected 28');
    });

    it.each([
      [{ id: 0 }, 'line 2: id "0" is not a positive integer'],
      [{ id: 1.5 }, 'id "1.5" is not a positive integer'],
      [{ lon: 181 }, 'lon "181" is not a longitude'],
      [{ lat: 95.2 }, 'lat "95.2" is not a latitude'],
      [{ lat: '' }, 'lat "" is not a latitude'],
      [{ year: 2001.5 }, 'year "2001.5" is not a year'],
      [{ index_value: 'high' }, 'index_value "high" is not a number'],
    ])('when a required field is invalid: %j', async (values, detail) => {
      server.serve(mockCsv(mockRow(values)));

      await refused(readMockSoilIndexData(server.url()), detail);
    });

    it('when an id repeats', async () => {
      server.serve(mockCsv(mockRow({ id: 7 }), mockRow({ id: 8 }), mockRow({ id: 7 })));

      await refused(readMockSoilIndexData(server.url()), 'line 4: id "7" repeats line 2');
    });

    it('when it is not valid CSV', async () => {
      server.serve(mockCsv(mockRow({}), mockRow({ id: 2, usda_texture: '"Loam"x' })));

      await refused(readMockSoilIndexData(server.url()), /^line 3: not valid CSV/);
    });
  });

  describe('refuses the download', () => {
    it('when the server answers with an error, naming the status and not the URL', async () => {
      server.serve('Forbidden', 403);

      const error = await readMockSoilIndexData(server.url('/mock.csv?X-Amz-Signature=secret')).catch(caught => caught);
      expect(error).toMatchObject({ code: 'SI_MOCK_DATA_UNAVAILABLE', detail: 'HTTP 403' });
    });

    it('when the body is larger than the cap', async () => {
      server.serve(mockCsv(...Array.from({ length: 100 }, (_, index) => mockRow({ id: index + 1 }))));

      await refused(readMockSoilIndexData(server.url(), { timeoutMs: 60_000, maxBytes: 1024 }), 'larger than 1024 bytes');
    });

    it('when the body does not complete in time', async () => {
      server.handle((_request, response) => {
        response.writeHead(200);
        response.write(`${MOCK_HEADER}\n`);
      });

      await refused(readMockSoilIndexData(server.url(), { timeoutMs: 200, maxBytes: 1024 * 1024 }), 'no complete response within 200 ms');
    });

    it('when nothing answers', async () => {
      // A port just freed, not a low one: fetch refuses blocked ports like 1 before connecting.
      const closed = mockDataServer();
      await closed.start();
      const url = closed.url();
      await closed.stop();

      await refused(readMockSoilIndexData(url), 'request failed: ECONNREFUSED');
    });

    it('when the value is not an http(s) URL', async () => {
      await refused(readMockSoilIndexData('file:///tmp/mock.csv'), 'must be http(s), not file:');
      await refused(readMockSoilIndexData('mock.csv'), 'not a URL');
    });
  });
});
