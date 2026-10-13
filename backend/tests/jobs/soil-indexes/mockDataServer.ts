import http from 'http';
import { AddressInfo } from 'net';
import { MOCK_SOIL_INDEX_COLUMNS } from '../../../src/jobs/soil-indexes/mockSoilIndexData';

type Column = (typeof MOCK_SOIL_INDEX_COLUMNS)[number];

/** Row 1 of the reference mock.csv, as written there. */
const SAMPLE: Record<Column, string> = {
  id: '1',
  lon: '6.945976106',
  lat: '45.031779109',
  geom_wkt: 'POINT (6.945976106 45.031779109)',
  year: '2001',
  min_depth_cm: '30',
  max_depth_cm: '60',
  index_value: '173.94711618477376',
  clay_pct: '13.2',
  sand_pct: '53.8',
  silt_pct_calc: '33.0',
  usda_texture: 'Sandy Loam',
  som_g_kg: '77.6',
  ph_h2o: '7.6',
  p_mg_kg: '195.0',
  k_cmolc_kg: '0.44',
  ca_cmolc_kg: '15.81',
  mg_cmolc_kg: '2.51',
  model_texture_class: '1',
  model_som_pct: '7.76',
  model_ph: '7.6',
  model_p_ppm: '195.0',
  model_k_ppm: '171.6',
  model_ca_ppm: '3162.0',
  model_mg_ppm: '301.2',
  model_csc_meq_100g: '18.76',
  model_herb: '1.0',
  model_nema: '1.0',
};

export const MOCK_HEADER = MOCK_SOIL_INDEX_COLUMNS.join(',');

/** One CSV line: the reference row with `values` replaced, and geom_wkt following lon/lat. */
export const mockRow = (values: Partial<Record<Column, string | number>>): string => {
  const row: Record<string, string | number> = { ...SAMPLE, ...values };
  if (values.geom_wkt === undefined) {
    row['geom_wkt'] = `POINT (${row['lon']} ${row['lat']})`;
  }
  return MOCK_SOIL_INDEX_COLUMNS.map(column => String(row[column])).join(',');
};

export const mockCsv = (...rows: string[]): string => `${[MOCK_HEADER, ...rows].join('\n')}\n`;

/** Serves whatever a test sets, on 127.0.0.1 for the reason jest.beforeEach.ts gives. */
export const mockDataServer = () => {
  let handler: http.RequestListener = (_request, response) => response.writeHead(404).end();
  const server = http.createServer((request, response) => handler(request, response));
  let origin = '';

  return {
    start: () =>
      new Promise<void>(resolve =>
        server.listen(0, '127.0.0.1', () => {
          origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          resolve();
        }),
      ),
    // A response a test left hanging would otherwise keep close() waiting.
    stop: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
    url: (path = '/mock.csv') => `${origin}${path}`,
    serve: (body: string, status = 200) => {
      handler = (_request, response) => response.writeHead(status, { 'Content-Type': 'text/csv' }).end(body);
    },
    handle: (next: http.RequestListener) => {
      handler = next;
    },
  };
};
