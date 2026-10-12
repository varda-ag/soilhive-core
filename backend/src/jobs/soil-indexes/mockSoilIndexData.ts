import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream } from 'stream/web';
import { CsvError, parse } from 'csv-parse';
import { JobError } from '../../errors/JobError';
import { getErrorMessage } from '../../utils/error';
import { log } from '../../utils/logger';

/** The `MOCK_SOIL_INDEX_DATA` columns, in the only order they are read in. The header must match exactly. */
export const MOCK_SOIL_INDEX_COLUMNS = [
  'id',
  'lon',
  'lat',
  'geom_wkt',
  'year',
  'min_depth_cm',
  'max_depth_cm',
  'index_value',
  'clay_pct',
  'sand_pct',
  'silt_pct_calc',
  'usda_texture',
  'som_g_kg',
  'ph_h2o',
  'p_mg_kg',
  'k_cmolc_kg',
  'ca_cmolc_kg',
  'mg_cmolc_kg',
  'model_texture_class',
  'model_som_pct',
  'model_ph',
  'model_p_ppm',
  'model_k_ppm',
  'model_ca_ppm',
  'model_mg_ppm',
  'model_csc_meq_100g',
  'model_herb',
  'model_nema',
] as const;

const ID = 0;
const LON = 1;
const LAT = 2;
const GEOM_WKT = 3;
const YEAR = 4;
const INDEX_VALUE = 7;

/** Columns stored elsewhere than in `metadata`: the geometry, `year` and `value`. */
const NOT_METADATA = new Set([LON, LAT, GEOM_WKT, YEAR, INDEX_VALUE]);

export interface MockSoilIndexRow {
  id: number;
  lon: number;
  lat: number;
  year: number;
  /** `index_value`, rounded to 3 decimals. */
  value: number;
  /** Every other column by header name; numbers as numbers, empty cells omitted. */
  metadata: Record<string, number | string>;
}

export interface MockSoilIndexLimits {
  timeoutMs: number;
  maxBytes: number;
}

const LIMITS: MockSoilIndexLimits = { timeoutMs: 60_000, maxBytes: 50 * 1024 * 1024 };

const SMALLINT_MAX = 32_767;
const INTEGER_MAX = 2_147_483_647;

/** `detail` reaches job data, so it never holds the URL or a raw network error. */
const unavailable = (detail: string): JobError => new JobError('SI_MOCK_DATA_UNAVAILABLE', {}, detail);

/** The URL as it may be logged: a pre-signed query string is a credential. */
const redact = (url: URL): string => `${url.origin}${url.pathname}`;

const quote = (cell: string): string => JSON.stringify(cell.length > 40 ? `${cell.slice(0, 40)}…` : cell);

const numberIn = (cell: string): number | null => {
  if (cell === '') {
    return null;
  }
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
};

/** A failure that is not already ours, explained without anything it may carry. */
const explain = (error: unknown, limits: MockSoilIndexLimits): string => {
  if (error instanceof CsvError) {
    return `line ${error['lines']}: not valid CSV (${error.code})`;
  }
  const { name, cause } = (error ?? {}) as { name?: string; cause?: { code?: unknown } };
  if (name === 'TimeoutError') {
    return `no complete response within ${limits.timeoutMs} ms`;
  }
  if (typeof cause?.code === 'string') {
    return `request failed: ${cause.code}`;
  }
  return `unexpected ${name ?? 'error'}`;
};

const toRow = (record: string[], line: number, lines: Map<number, number>): MockSoilIndexRow => {
  if (record.length !== MOCK_SOIL_INDEX_COLUMNS.length) {
    throw unavailable(`line ${line}: ${record.length} fields, expected ${MOCK_SOIL_INDEX_COLUMNS.length}`);
  }
  const invalid = (index: number, rule: string) =>
    unavailable(`line ${line}: ${MOCK_SOIL_INDEX_COLUMNS[index]} ${quote(record[index]!)} ${rule}`);

  const id = numberIn(record[ID]!);
  if (id === null || !Number.isInteger(id) || id < 1 || id > INTEGER_MAX) {
    throw invalid(ID, 'is not a positive integer');
  }
  if (lines.has(id)) {
    throw invalid(ID, `repeats line ${lines.get(id)}`);
  }
  lines.set(id, line);

  const lon = numberIn(record[LON]!);
  if (lon === null || Math.abs(lon) > 180) {
    throw invalid(LON, 'is not a longitude');
  }
  const lat = numberIn(record[LAT]!);
  if (lat === null || Math.abs(lat) > 90) {
    throw invalid(LAT, 'is not a latitude');
  }
  const year = numberIn(record[YEAR]!);
  if (year === null || !Number.isInteger(year) || Math.abs(year) > SMALLINT_MAX) {
    throw invalid(YEAR, 'is not a year');
  }
  const value = numberIn(record[INDEX_VALUE]!);
  if (value === null) {
    throw invalid(INDEX_VALUE, 'is not a number');
  }

  const metadata: Record<string, number | string> = {};
  record.forEach((cell, index) => {
    if (!NOT_METADATA.has(index) && cell !== '') {
      metadata[MOCK_SOIL_INDEX_COLUMNS[index]!] = numberIn(cell) ?? cell;
    }
  });

  return { id, lon, lat, year, value: Math.round(value * 1000) / 1000, metadata };
};

const checkHeader = (record: string[]): void => {
  const mismatch = MOCK_SOIL_INDEX_COLUMNS.findIndex((name, index) => record[index] !== name);
  if (mismatch !== -1) {
    const found = mismatch < record.length ? quote(record[mismatch]!) : 'missing';
    throw unavailable(`header column ${mismatch + 1} is ${found}, expected "${MOCK_SOIL_INDEX_COLUMNS[mismatch]}"`);
  }
  if (record.length !== MOCK_SOIL_INDEX_COLUMNS.length) {
    throw unavailable(`header has ${record.length} columns, expected ${MOCK_SOIL_INDEX_COLUMNS.length}`);
  }
};

/**
 * Downloads and parses the `MOCK_SOIL_INDEX_DATA` CSV, streamed straight into the parser.
 * Columns are read by position; the header is only checked, so a reordered file fails rather
 * than scoring the wrong column. Any problem throws `SI_MOCK_DATA_UNAVAILABLE`: a Run never
 * falls back to random scores.
 */
export async function readMockSoilIndexData(url: string, limits: MockSoilIndexLimits = LIMITS): Promise<MockSoilIndexRow[]> {
  let source: URL;
  try {
    source = new URL(url);
  } catch {
    throw unavailable('MOCK_SOIL_INDEX_DATA is not a URL');
  }
  if (source.protocol !== 'http:' && source.protocol !== 'https:') {
    throw unavailable(`MOCK_SOIL_INDEX_DATA must be http(s), not ${source.protocol}`);
  }

  const rows: MockSoilIndexRow[] = [];
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(limits.timeoutMs) });
    if (!response.ok) {
      await response.body?.cancel();
      throw unavailable(`HTTP ${response.status}`);
    }
    if (!response.body) {
      throw unavailable('empty response');
    }

    let bytes = 0;
    const capped = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > limits.maxBytes) {
          callback(unavailable(`larger than ${limits.maxBytes} bytes`));
        } else {
          callback(null, chunk);
        }
      },
    });

    let header = false;
    const lines = new Map<number, number>();
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      capped,
      parse({ bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, info: true }),
      async function (records: AsyncIterable<{ record: string[]; info: { lines: number } }>) {
        for await (const { record, info } of records) {
          if (header) {
            rows.push(toRow(record, info.lines, lines));
          } else {
            checkHeader(record);
            header = true;
          }
        }
      },
    );
    if (!header) {
      throw unavailable('empty file');
    }
  } catch (error) {
    const failure = JobError.isJobError(error) ? error : unavailable(explain(error, limits));
    log.warn('Mock soil index data unavailable', { url: redact(source), detail: failure.detail, error: getErrorMessage(error) });
    throw failure;
  }

  log.info('Read mock soil index data', { url: redact(source), rows: rows.length });
  return rows;
}
