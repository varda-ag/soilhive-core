/*
 * Performance suite for the endpoints tagged `data-filters` in openapi.yaml,
 * plus GET /soil-data, which consumes the dataset list produced by
 * GET /data-filters/{filterId}/datasets.
 *
 * Methodology: the suite measures the compiled dist build (`node dist/app.js`)
 * against the live database configured in .env, instead of seeded synthetic
 * data. This keeps the measurements realistic and the script free of docker
 * orchestration, at the cost of reproducibility: two runs are only comparable
 * when the data did not change in between. To guard that, every result file
 * embeds an environment fingerprint (git sha, DB row counts, asset hashes,
 * iteration count) and the diff report (diff.ts) warns when fingerprints
 * differ.
 *
 * Flow: for every *.geojson asset in tests/assets/geojson (or only the assets
 * named in PERF_ASSETS, comma-separated, exact names without the extension —
 * an unknown name aborts the run) and every params
 * variant — the unfiltered "default" (`{}`) always runs first, followed by any
 * <asset>.params.<n>.json sidecar files — the suite first POSTs a data filter
 * (phase 1), then exercises the GET-by-id endpoints against the created
 * filters (phase 2). Phase 2 also calls GET /soil-data with the public
 * non-raster dataset ids extracted from the /datasets response (limit=200,
 * the spec maximum; private datasets would 403 the unauthenticated call and
 * raster datasets are excluded by the real client too). When the filter
 * matches no such datasets the row is recorded as skipped without failing
 * the run, mirroring the frontend, which does not call the endpoint then.
 * Each measured row is one
 * untimed warmup request followed by PERF_ITERATIONS timed requests.
 *
 * Error policy: unexpected status codes, timeouts, and network failures are
 * recorded on the affected row (statusCodes/errors, status 0 = no response).
 * A row stops at its first failed request — a failed warmup skips the timed
 * iterations entirely — because the identical request would fail again; the
 * run then continues with the remaining rows. Latency stats are computed over
 * successful samples only. The process exits non-zero when any row failed,
 * after writing the result files. Only precondition failures (server does not
 * start, assets missing, fingerprint DB unreachable) abort the run.
 *
 * Side effect: each run persists up to (1 + PERF_ITERATIONS) data filters per
 * asset/params variant in the target database.
 *
 * Output: perf-results/<timestamp>-<short-sha>.json + .html.
 * Compare runs with `npm run perf:diff -- <baseline.json> <current.json>`
 * (without arguments the two most recent runs are compared).
 */
import { ChildProcess, execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { config } from 'dotenv';
import { Client } from 'pg';
import { getDBPassword, getSSL } from '../../utils/db-credentials';
import { renderRunHtml } from './report';
import { AssetFingerprint, computeStats, PERF_RUN_VERSION, PerfRun, ResultRow, rowKey } from './types';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');
config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

const ITERATIONS = Number(process.env['PERF_ITERATIONS']) || 3;
// Comma-separated exact asset names (file name minus .geojson); empty = all assets.
const ASSET_FILTER = (process.env['PERF_ASSETS'] || '')
  .split(',')
  .map(s => s.trim())
  .filter(s => s.length > 0);
const DAI_RESOLUTIONS = (process.env['PERF_DAI_RESOLUTIONS'] || '3,5,7').split(',').map(Number);
const REQUEST_TIMEOUT_MS = Number(process.env['PERF_TIMEOUT_MS']) || 120_000;
const SERVER_START_TIMEOUT_MS = Number(process.env['PERF_SERVER_TIMEOUT_MS']) || 60_000;
const PORT = Number(process.env.PORT) || 4001;
const BASE_URL = `http://localhost:${PORT}`;
const ASSETS_DIR = path.join(BACKEND_ROOT, 'tests', 'assets', 'geojson');
const RESULTS_DIR = path.join(BACKEND_ROOT, 'perf-results');
const FINGERPRINT_TABLES = ['datasets', 'dataset_layers', 'layers', 'observations', 'features'];
// openapi.yaml caps /soil-data's limit at 200 — this measures the worst case the API permits.
const SOIL_DATA_LIMIT = 200;

interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

interface ParamsVariant {
  variant: string;
  parameters: unknown;
  sha256: string;
}

interface AssetSpec {
  name: string;
  file: string;
  sha256: string;
  sizeBytes: number;
  geometries: Geometry[];
  bbox: [number, number, number, number];
  variants: ParamsVariant[];
}

interface Sample {
  durationMs: number;
  /** 0 when the request failed before a response arrived (timeout, network error). */
  statusCode: number;
  responseBytes: number;
  bodyText: string;
  /** Set when the sample failed (unexpected status or no response). */
  error: string | null;
}

class RunAbort extends Error {}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const sha256 = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex');

const git = (args: string): string => execSync(`git ${args}`, { cwd: BACKEND_ROOT, encoding: 'utf8' }).trim();

// ---------------------------------------------------------------------------
// Asset discovery
// ---------------------------------------------------------------------------

const extractGeometries = (node: unknown, file: string): Geometry[] => {
  const found: Geometry[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (obj['type'] === 'FeatureCollection' && Array.isArray(obj['features'])) {
      obj['features'].forEach(visit);
    } else if (obj['type'] === 'Feature') {
      visit(obj['geometry']);
    } else if (obj['type'] === 'GeometryCollection' && Array.isArray(obj['geometries'])) {
      obj['geometries'].forEach(visit);
    } else if (obj['type'] === 'Polygon' || obj['type'] === 'MultiPolygon') {
      found.push(obj as unknown as Geometry);
    }
  };
  visit(node);
  if (found.length === 0) {
    throw new RunAbort(`No Polygon/MultiPolygon geometries found in ${file} (the API rejects other types)`);
  }
  return found;
};

const computeBbox = (geometries: Geometry[]): [number, number, number, number] => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      minX = Math.min(minX, coords[0]);
      maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxY = Math.max(maxY, coords[1]);
    } else {
      coords.forEach(visit);
    }
  };
  geometries.forEach(g => visit(g.coordinates));
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new RunAbort('Could not compute a bounding box from the asset geometries');
  }
  return [minX, minY, maxX, maxY];
};

const discoverParamsVariants = (assetName: string, files: string[]): ParamsVariant[] => {
  const prefix = `${assetName}.params.`;
  const defaultVariant: ParamsVariant = { variant: 'default', parameters: {}, sha256: sha256(JSON.stringify({})) };
  const sidecars = files
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map(file => {
      const variant = file.slice(prefix.length, -'.json'.length);
      const raw = fs.readFileSync(path.join(ASSETS_DIR, file), 'utf8');
      return { variant, parameters: JSON.parse(raw), sha256: sha256(raw) };
    });
  // The unfiltered default always runs first, so every asset has a worst-case baseline row
  return [defaultVariant, ...sidecars];
};

const discoverAssets = (): AssetSpec[] => {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new RunAbort(`Assets directory not found: ${ASSETS_DIR}`);
  }
  const files = fs.readdirSync(ASSETS_DIR);
  let geojsonFiles = files.filter(f => f.endsWith('.geojson')).sort((a, b) => a.localeCompare(b));
  if (geojsonFiles.length === 0) {
    throw new RunAbort(`No .geojson assets found in ${ASSETS_DIR}`);
  }
  if (ASSET_FILTER.length > 0) {
    const names = geojsonFiles.map(f => f.slice(0, -'.geojson'.length));
    const unknown = ASSET_FILTER.filter(name => !names.includes(name));
    if (unknown.length > 0) {
      throw new RunAbort(`Unknown asset(s) in PERF_ASSETS: ${unknown.join(', ')} — available: ${names.join(', ')}`);
    }
    geojsonFiles = geojsonFiles.filter(f => ASSET_FILTER.includes(f.slice(0, -'.geojson'.length)));
  }
  return geojsonFiles.map(file => {
    const fullPath = path.join(ASSETS_DIR, file);
    const raw = fs.readFileSync(fullPath);
    const geometries = extractGeometries(JSON.parse(raw.toString('utf8')), file);
    const name = file.slice(0, -'.geojson'.length);
    return {
      name,
      file,
      sha256: sha256(raw),
      sizeBytes: raw.length,
      geometries,
      bbox: computeBbox(geometries),
      variants: discoverParamsVariants(name, files),
    };
  });
};

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

const isServerResponding = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
};

const startServer = async (): Promise<{ child: ChildProcess; outputTail: () => string }> => {
  const distApp = path.join(BACKEND_ROOT, 'dist', 'app.js');
  if (!fs.existsSync(distApp)) {
    throw new RunAbort(`${distApp} not found — run via "npm run perf" so the build step executes first`);
  }
  if (await isServerResponding()) {
    throw new RunAbort(`Something is already listening on ${BASE_URL} — stop it first, otherwise the suite would measure the wrong server`);
  }

  let output = '';
  const child = spawn(process.execPath, [distApp], {
    cwd: BACKEND_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk: Buffer) => {
    output = (output + chunk.toString('utf8')).slice(-20_000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  const outputTail = () => output;

  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new RunAbort(`Server exited with code ${child.exitCode} during startup.\n--- server output ---\n${outputTail()}`);
    }
    try {
      const res = await fetch(`${BASE_URL}/ready`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return { child, outputTail };
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  child.kill('SIGKILL');
  throw new RunAbort(`Server did not become ready within ${SERVER_START_TIMEOUT_MS}ms.\n--- server output ---\n${outputTail()}`);
};

const stopServer = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  const result = await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)]);
  if (!result) {
    child.kill('SIGKILL');
    await exited;
  }
};

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

const getDbCounts = async (): Promise<Record<string, number>> => {
  const schema = process.env.POSTGRES_SCHEMA;
  if (!schema) throw new RunAbort('POSTGRES_SCHEMA is not set');
  // Same credential strategy as utils/data-source.ts: plain password for the
  // local Docker DB, IAM auth token + RDS CA bundle when POSTGRES_AWS_REGION
  // is configured instead of POSTGRES_PASSWORD.
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER,
    password: await getDBPassword(),
    database: process.env.POSTGRES_DB,
    ...(process.env.POSTGRES_PASSWORD ? {} : { ssl: getSSL() }),
  });
  try {
    await client.connect();
  } catch (err) {
    throw new RunAbort(
      `Could not connect to Postgres for the environment fingerprint (${(err as Error).message}). ` +
        'The fingerprint is what makes runs comparable, so the suite refuses to continue without it.',
    );
  }
  try {
    const counts: Record<string, number> = {};
    const quotedSchema = `"${schema.replace(/"/g, '""')}"`;
    for (const table of FINGERPRINT_TABLES) {
      const result = await client.query(`SELECT count(*)::bigint AS count FROM ${quotedSchema}."${table}"`);
      counts[table] = Number(result.rows[0].count);
    }
    return counts;
  } finally {
    await client.end();
  }
};

// ---------------------------------------------------------------------------
// Request execution
// ---------------------------------------------------------------------------

const timedRequest = async (
  method: string,
  url: string,
  body: unknown | null,
  expectedStatus: number,
  context: string,
): Promise<Sample> => {
  const init: RequestInit = {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(body === null ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  };
  let response: Response;
  let bodyText: string;
  const start = performance.now();
  try {
    response = await fetch(url, init);
    bodyText = await response.text();
  } catch (err) {
    return {
      durationMs: performance.now() - start,
      statusCode: 0,
      responseBytes: 0,
      bodyText: '',
      error: `Request failed (${context}): ${method} ${url}: ${(err as Error).message}`,
    };
  }
  const durationMs = performance.now() - start;
  const error =
    response.status === expectedStatus
      ? null
      : `Unexpected status (${context}): ${method} ${url}: expected ${expectedStatus}, got ${response.status}: ${bodyText.slice(0, 500)}`;
  return { durationMs, statusCode: response.status, responseBytes: Buffer.byteLength(bodyText), bodyText, error };
};

const measureRow = async (
  meta: {
    method: string;
    pathTemplate: string;
    asset: string;
    paramsVariant: string;
    daiResolution: number | null;
    filterId: string | null;
  },
  expectedStatus: number,
  request: () => Promise<Sample>,
): Promise<{ row: ResultRow; warmup: Sample; samples: Sample[] }> => {
  const key = rowKey(meta.method, meta.pathTemplate, meta.asset, meta.paramsVariant, meta.daiResolution);
  console.log(`  ${key}`);
  const warmup = await request();
  const samples: Sample[] = [];
  // Fail fast: the same request is repeated verbatim, so an error is
  // deterministic — further iterations would only burn timeout budget and
  // persist more junk filters. A failed warmup skips the timed loop entirely.
  if (warmup.error === null) {
    for (let i = 0; i < ITERATIONS; i++) {
      const sample = await request();
      samples.push(sample);
      if (sample.error !== null) break;
    }
  }
  const successful = samples.filter(s => s.error === null);
  const errors = samples.map(s => s.error).filter((e): e is string => e !== null);
  if (warmup.error !== null) {
    errors.push(`warmup: ${warmup.error}`);
  }
  for (const error of errors) {
    console.warn(`    FAILED: ${error.split('\n')[0]}`);
  }
  const successBytes = successful.map(s => s.responseBytes);
  const row: ResultRow = {
    key,
    ...meta,
    expectedStatus,
    statusCodes: samples.map(s => s.statusCode),
    errors,
    durationsMs: samples.map(s => s.durationMs),
    responseBytes: samples.map(s => s.responseBytes),
    stats: successful.length > 0 ? computeStats(successful.map(s => s.durationMs)) : null,
    meanResponseBytes: successBytes.length > 0 ? successBytes.reduce((acc, v) => acc + v, 0) / successBytes.length : null,
    ok: errors.length === 0,
  };
  return { row, warmup, samples };
};

/**
 * Row for an endpoint that was not exercised. `ok: false` (default) marks a
 * precondition failure (e.g. no filter id from the POST phase) that fails the
 * run; `ok: true` marks a legitimate data-dependent skip (e.g. the filter
 * matches no public non-raster datasets, so there is nothing to request).
 */
const skippedRow = (
  meta: {
    method: string;
    pathTemplate: string;
    asset: string;
    paramsVariant: string;
    daiResolution: number | null;
    filterId: string | null;
  },
  expectedStatus: number,
  reason: string,
  ok = false,
): ResultRow => ({
  key: rowKey(meta.method, meta.pathTemplate, meta.asset, meta.paramsVariant, meta.daiResolution),
  ...meta,
  expectedStatus,
  statusCodes: [],
  errors: [reason],
  durationsMs: [],
  responseBytes: [],
  stats: null,
  meanResponseBytes: null,
  ok,
});

/**
 * Ids (slugs) from a /data-filters/{filterId}/datasets response body that an
 * unauthenticated /soil-data call can preview: public, non-raster datasets
 * (any private slug in the list 403s the whole request, and the production
 * client excludes raster datasets as well). Returns null when the body is not
 * a JSON array.
 */
const extractSoilDataDatasetIds = (datasetsBody: string): string[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(datasetsBody);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return (parsed as { id?: string; data_type?: string; visibility?: string }[])
    .filter(d => typeof d.id === 'string' && d.visibility === 'public' && d.data_type !== 'raster')
    .map(d => d.id!);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const wallClockStart = performance.now();
  const assets = discoverAssets();
  const gitSha = git('rev-parse HEAD');
  const gitBranch = git('rev-parse --abbrev-ref HEAD');
  const gitDirty = git('status --porcelain') !== '';
  const timestamp = new Date().toISOString();

  console.log(
    `Performance suite: ${assets.length} asset(s)${ASSET_FILTER.length > 0 ? ' (selected via PERF_ASSETS)' : ''}, ${ITERATIONS} iterations/row, DAI resolutions [${DAI_RESOLUTIONS.join(', ')}]`,
  );

  const { child, outputTail } = await startServer();
  console.log(`Server ready on ${BASE_URL}`);

  const results: ResultRow[] = [];
  try {
    const dbCounts = await getDbCounts();

    // Phase 1: POST /data-filters — one filter per (asset, params variant).
    // The id of the first successfully created filter is reused by the GET phase.
    console.log('Phase 1: POST /data-filters');
    const filterIds = new Map<string, string>();
    for (const asset of assets) {
      for (const variant of asset.variants) {
        const context = `asset=${asset.name} params=${variant.variant}`;
        const payload = { geometries: asset.geometries, parameters: variant.parameters };
        const { row, warmup, samples } = await measureRow(
          {
            method: 'POST',
            pathTemplate: '/data-filters',
            asset: asset.name,
            paramsVariant: variant.variant,
            daiResolution: null,
            filterId: null,
          },
          201,
          () => timedRequest('POST', `${BASE_URL}/data-filters`, payload, 201, context),
        );
        results.push(row);
        const filterId = [warmup, ...samples]
          .filter(s => s.error === null)
          .map(s => {
            try {
              return (JSON.parse(s.bodyText) as { id?: string }).id;
            } catch {
              return undefined;
            }
          })
          .find(id => id !== undefined);
        if (filterId) {
          filterIds.set(`${asset.name}|${variant.variant}`, filterId);
          // The POST row reports the filter its GET rows ran against, so any row can be reproduced from the report alone
          row.filterId = filterId;
        } else {
          console.warn(`    no filter id obtained (${context}) — its GET endpoints will be recorded as skipped`);
        }
      }
    }

    // Phase 2: GET endpoints against the filters created in phase 1.
    console.log('Phase 2: GET endpoints');
    const getTemplates = [
      { pathTemplate: '/data-filters/{filterId}', suffix: '' },
      { pathTemplate: '/data-filters/{filterId}/coverage', suffix: '/coverage' },
      { pathTemplate: '/data-filters/{filterId}/datasets', suffix: '/datasets' },
    ];
    for (const asset of assets) {
      for (const variant of asset.variants) {
        const filterId = filterIds.get(`${asset.name}|${variant.variant}`);
        const context = `asset=${asset.name} params=${variant.variant}`;
        const skipReason = `skipped: POST /data-filters (${context}) produced no filter id`;
        let datasetsBody: string | undefined;
        for (const { pathTemplate, suffix } of getTemplates) {
          const meta = {
            method: 'GET',
            pathTemplate,
            asset: asset.name,
            paramsVariant: variant.variant,
            daiResolution: null,
            filterId: filterId ?? null,
          };
          if (!filterId) {
            results.push(skippedRow(meta, 200, skipReason));
            continue;
          }
          const url = `${BASE_URL}/data-filters/${filterId}${suffix}`;
          const { row, warmup, samples } = await measureRow(meta, 200, () => timedRequest('GET', url, null, 200, context));
          results.push(row);
          if (suffix === '/datasets') {
            datasetsBody = [warmup, ...samples].find(s => s.error === null)?.bodyText;
          }
        }

        // GET /soil-data with the dataset ids extracted from the /datasets response
        const soilDataMeta = {
          method: 'GET',
          pathTemplate: '/soil-data',
          asset: asset.name,
          paramsVariant: variant.variant,
          daiResolution: null,
          filterId: filterId ?? null,
        };
        if (!filterId) {
          results.push(skippedRow(soilDataMeta, 200, skipReason));
        } else if (datasetsBody === undefined) {
          results.push(
            skippedRow(soilDataMeta, 200, `skipped: GET /data-filters/{filterId}/datasets (${context}) returned no successful response`),
          );
        } else {
          const datasetIds = extractSoilDataDatasetIds(datasetsBody);
          if (datasetIds === null) {
            results.push(skippedRow(soilDataMeta, 200, `skipped: could not parse the /datasets response (${context})`));
          } else if (datasetIds.length === 0) {
            results.push(skippedRow(soilDataMeta, 200, `skipped: filter matches no public non-raster datasets (${context})`, true));
          } else {
            const query = `datasets=${datasetIds.map(encodeURIComponent).join(',')}&filterId=${filterId}&limit=${SOIL_DATA_LIMIT}`;
            const url = `${BASE_URL}/soil-data?${query}`;
            const { row } = await measureRow(soilDataMeta, 200, () => timedRequest('GET', url, null, 200, context));
            results.push(row);
          }
        }
        for (const resolution of DAI_RESOLUTIONS) {
          const meta = {
            method: 'GET',
            pathTemplate: '/data-filters/{filterId}/dai',
            asset: asset.name,
            paramsVariant: variant.variant,
            daiResolution: resolution,
            filterId: filterId ?? null,
          };
          if (!filterId) {
            results.push(skippedRow(meta, 200, skipReason));
            continue;
          }
          const query = `bbox=${encodeURIComponent(asset.bbox.join(','))}&resolution=${resolution}`;
          const url = `${BASE_URL}/data-filters/${filterId}/dai?${query}`;
          const { row } = await measureRow(meta, 200, () => timedRequest('GET', url, null, 200, `${context} res=${resolution}`));
          results.push(row);
        }
      }
    }

    const assetFingerprints: AssetFingerprint[] = assets.map(a => ({
      name: a.name,
      file: a.file,
      sha256: a.sha256,
      sizeBytes: a.sizeBytes,
      paramsVariants: a.variants.map(v => ({ variant: v.variant, sha256: v.sha256 })),
    }));
    const run: PerfRun = {
      version: PERF_RUN_VERSION,
      fingerprint: {
        timestamp,
        gitSha,
        gitBranch,
        gitDirty,
        nodeVersion: process.version,
        iterations: ITERATIONS,
        daiResolutions: DAI_RESOLUTIONS,
        assets: assetFingerprints,
        db: dbCounts,
      },
      results,
      totals: {
        requests: results.reduce((acc, r) => acc + r.durationsMs.length, 0),
        wallClockMs: performance.now() - wallClockStart,
      },
    };

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const runId = `${timestamp.replace(/[:.]/g, '-')}-${gitSha.slice(0, 7)}`;
    const jsonPath = path.join(RESULTS_DIR, `${runId}.json`);
    const htmlPath = path.join(RESULTS_DIR, `${runId}.html`);
    fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2));
    fs.writeFileSync(htmlPath, renderRunHtml(run));

    console.log('\nMedian latency per row:');
    for (const row of results) {
      const median = row.stats ? `${row.stats.median.toFixed(1).padStart(9)} ms` : row.ok ? '  SKIPPED   ' : '   FAILED   ';
      console.log(`  ${median}  ${row.key}${row.ok ? '' : '  [errors]'}`);
    }
    const failedRows = results.filter(row => !row.ok);
    if (failedRows.length > 0) {
      console.warn(`\n${failedRows.length} of ${results.length} rows had failed requests:`);
      for (const row of failedRows) {
        console.warn(`  ${row.key}\n    ${row.errors[0]}`);
      }
      process.exitCode = 1;
    }
    console.log(`\nJSON:  ${jsonPath}`);
    console.log(`HTML:  ${htmlPath}`);
  } catch (err) {
    if (!(err instanceof RunAbort)) {
      console.error(`\n--- server output ---\n${outputTail()}`);
    }
    throw err;
  } finally {
    await stopServer(child);
  }
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(err => {
    console.error(`\nPerformance run aborted: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
