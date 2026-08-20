/*
 * Performance suite for the endpoints tagged `data-filters` in openapi.yaml,
 * plus GET /soil-data, which consumes the dataset list produced by
 * GET /data-filters/{filterId}/datasets.
 *
 * Two modes, selected by PERF_BASE_URL:
 *
 * - Managed (default): the suite measures the compiled dist build
 *   (`node dist/app.js`), which it spawns itself on localhost, against the live
 *   database configured in .env instead of seeded synthetic data. This keeps
 *   the measurements realistic and the script free of docker orchestration.
 * - Attached (PERF_BASE_URL set to an API root, e.g.
 *   https://qa.example.com/api/v1): the suite measures a server it does not
 *   manage — nothing is built for it, spawned or stopped, and GET /ready must
 *   already succeed. What is measured is the deployed system as a client
 *   experiences it: warm shared caches, load balancing across nodes, and real
 *   network latency. See "Cache state" below.
 *
 * Either way, two runs are only comparable when the data did not change in
 * between. To guard that, every result file embeds an environment fingerprint
 * (git sha, asset hashes, iteration count, the measured target, DB row counts,
 * and a data fingerprint read from GET /datasets) and the diff report (diff.ts)
 * warns when fingerprints differ. Attached runs carry no DB row counts — the
 * target's database is not reachable from here — so their data fingerprint
 * rests on GET /datasets alone; see docs/adr/0024. The recorded git sha and node
 * version describe this checkout and this process, i.e. the suite; in attached
 * mode they say nothing about the code or runtime deployed on the target, which
 * the API does not report.
 *
 * Cache state: query results are cached per process for 12h and invalidated
 * only by writes (docs/adr/0008), and a Filter is deduplicated by canonical
 * content identity (docs/adr/0007) — so a repeat run gets the same filter id,
 * hence the same `dai:{filterId}:{bbox}:{resolution}` cache key. In managed
 * mode the spawned process starts with an empty cache and every row measures
 * real work. In attached mode the target has been serving traffic for hours, so
 * by default DAI and coverage rows may measure a cache lookup rather than a
 * query, and consecutive iterations of one row may land on nodes in different
 * cache states. Perturbing geometries, bbox or resolution to defeat that is
 * still rejected — it changes the asset fingerprint and voids comparability
 * with every existing baseline.
 *
 * PERF_CACHE_BYPASS=true instead leaves the inputs untouched and makes each
 * request opt out of the cache, via the secret-gated X-SoilHive-Cache-Bypass
 * header (docs/adr/0028). Bypassed requests neither read nor write the target's
 * cache, so a run costs the target the full work of every iteration and leaves
 * its cache untouched for other clients. The secret comes from
 * PERF_CACHE_BYPASS_SECRET in .env and must match CACHE_BYPASS_SECRET on the
 * target, which ignores the header entirely without one; the run aborts unless
 * the target echoes the header back, because a target that quietly ignores it
 * is otherwise indistinguishable from one that honoured it. A bypassed run is
 * recorded as such in the fingerprint and only ever auto-diffed against another
 * bypassed run. Note the bypass reaches the application cache only: Postgres
 * shared_buffers and the OS page cache stay warm and remain the dominant source
 * of run-to-run variance. The precomputed tables (docs/adr/0006, docs/adr/0009)
 * are deliberately not bypassed — they are the path production takes.
 *
 * PERF_WARMUP correspondingly loses its point in attached mode: it exists to
 * shed process-start cost, and there is no process start to shed. Combined with
 * the bypass it is contradictory rather than merely pointless, and aborts.
 *
 * Flow: for every *.geojson asset in tests/assets/geojson (or only the assets
 * named in PERF_ASSETS, comma-separated, exact names without the extension —
 * an unknown name aborts the run) and every params
 * variant — the unfiltered "default" (`{}`) always runs first, followed by any
 * <asset>.params.<n>.json sidecar files — the suite first POSTs a data filter
 * (phase 1), then exercises the GET-by-id endpoints against the created
 * filters (phase 2). PERF_ENDPOINT (coverage | datasets | soil-data | dai;
 * unknown values abort) restricts phase 2 to a single endpoint; phase 1 always
 * runs because every phase-2 row consumes its filter ids. In soil-data-only
 * mode the /datasets response the endpoint depends on is fetched once untimed
 * as a prerequisite instead of being measured. Phase 2 also calls GET /soil-data with the public
 * non-raster dataset ids extracted from the /datasets response (limit=200,
 * the spec maximum; private datasets would 403 the unauthenticated call and
 * raster datasets are excluded by the real client too). When the filter
 * matches no such datasets the row is recorded as skipped without failing
 * the run, mirroring the frontend, which does not call the endpoint then.
 * Each measured row is PERF_ITERATIONS timed requests, optionally preceded by
 * one untimed warmup request (opt-in via PERF_WARMUP=true, off by default).
 *
 * Error policy: unexpected status codes, timeouts, and network failures are
 * recorded on the affected row (statusCodes/errors, status 0 = no response).
 * A row stops at its first failed request — a failed warmup, when enabled,
 * skips the timed iterations entirely — because the identical request would
 * fail again; the
 * run then continues with the remaining rows. Latency stats are computed over
 * successful samples only. The process exits non-zero when any row failed,
 * after writing the result files. Only precondition failures (server does not
 * start, assets missing, fingerprint DB unreachable) abort the run.
 *
 * Side effect: the suite is not read-only. Phase 1 persists one data filter per
 * asset/params variant in the target database — one, not one per iteration,
 * because createFilter upserts on canonical content identity, so repeated
 * iterations and repeat runs resolve to the existing filter (and bump its
 * updated_at). Creating one still canonicalises the geometries, persists user
 * geometries and drives subdivision precomputation. In attached mode all of
 * that lands in a shared environment's database, and the run warms caches other
 * clients of that environment share. This is deliberately documented rather
 * than gated: a confirmation prompt would make the suite unusable from CI, and
 * a host allowlist would bake environment names into the repo.
 *
 * Output: perf-results/<timestamp>-<short-sha>.json + .html. With
 * STORAGE_MODE=s3 both files are also uploaded to s3://$S3_STORAGE_BUCKET/
 * perf-results/ under the same names (see publish.ts), so a run against a
 * deployed target survives the machine that measured it. The upload is best
 * effort: it is reported but never fails the run, since the artifacts are
 * already on disk and the measurement stands regardless.
 * Compare runs with `npm run perf:diff -- <baseline.json> <current.json>`
 * (without arguments the two most recent runs are compared).
 *
 * In a container (the `soilhive-core-perf` image, docs/adr/0029) four of the
 * assumptions above do not hold, and each has its own escape hatch here:
 * there is no `git` (PERF_GIT_SHA/PERF_GIT_BRANCH stand in), no .env (every
 * knob arrives through the environment, so the read ordering above still
 * executes but no longer discriminates), no durable disk
 * (PERF_REQUIRE_PUBLISH=true makes the S3 upload a precondition and a failed
 * one a failed run) and no reason for the runner and the server it spawns to
 * share a heap (PERF_SERVER_NODE_OPTIONS sets the child's). None of them
 * change how a developer's run behaves.
 */
import { ChildProcess, execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { config } from 'dotenv';
import { Client } from 'pg';
import { CACHE_BYPASS_APPLIED_VALUE, CACHE_BYPASS_HEADER } from '../../utils/cache-bypass';
import { getDBPassword, getSSL } from '../../utils/db-credentials';
import { isPerfPublishEnabled, isPerfPublishRequired, publishPerfArtifacts } from './publish';
import { renderRunHtml } from './report';
import { AssetFingerprint, computeStats, DatasetFingerprint, fileTimestamp, PERF_RUN_VERSION, PerfRun, ResultRow, rowKey } from './types';

/*
 * Read BEFORE .env is loaded, deliberately — the ordering is load-bearing, not
 * incidental. Every other knob may live in .env; this one decides which system
 * gets measured and written to (docs/adr/0024), so it must come from the shell,
 * where it is visible in the command and in shell history. Capturing it first
 * means a forgotten PERF_BASE_URL line in .env cannot silently point a run at a
 * deployed environment.
 */
const BASE_URL_FROM_SHELL = (process.env['PERF_BASE_URL'] || '').trim();

/*
 * Also read before .env, for the same reason and with the same load-bearing
 * ordering: this decides how much work the target is made to do — under bypass
 * its database performs 100% of the work on every iteration of every row — so a
 * forgotten .env line must not be able to turn an ordinary run into a
 * load-generating one (docs/adr/0028). The *secret* is deliberately not read
 * here: the justification for shell-first is that the value is visible in the
 * command and in shell history, which inverts for a production credential.
 */
const CACHE_BYPASS = process.env['PERF_CACHE_BYPASS'] === 'true';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');
config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

// From .env, after dotenv, so it never enters shell history. Must match
// CACHE_BYPASS_SECRET on the target, which ignores the header without it.
const CACHE_BYPASS_SECRET = (process.env['PERF_CACHE_BYPASS_SECRET'] || '').trim();

const ITERATIONS = Number(process.env['PERF_ITERATIONS']) || 1;
// Untimed warmup request before the timed iterations. Off by default; set PERF_WARMUP=true to enable.
const WARMUP = process.env['PERF_WARMUP'] === 'true';
// Comma-separated exact asset names (file name minus .geojson); empty = all assets.
const ASSET_FILTER = (process.env['PERF_ASSETS'] || '')
  .split(',')
  .map(s => s.trim())
  .filter(s => s.length > 0);
const DAI_RESOLUTIONS = (process.env['PERF_DAI_RESOLUTIONS'] || '3,5,7').split(',').map(Number);
// Single phase-2 endpoint to measure; empty = the full suite. POST /data-filters
// is not an option: it always runs, since it produces the filter ids every other
// row consumes. The plain GET /data-filters/{filterId} row only runs unrestricted.
const ENDPOINT_OPTIONS = ['coverage', 'datasets', 'soil-data', 'dai'] as const;
type PerfEndpoint = (typeof ENDPOINT_OPTIONS)[number];
/*
 * NODE_OPTIONS for the server spawned in managed mode, replacing the one this
 * process runs with. They have to be separable: the backend image runs
 * production on --max-old-space-size=256, while this process parses every asset
 * up front and holds each row's response bodies, so one shared cap either
 * measures a heap production does not have or risks an OOM in the measuring
 * tool near the end of a long run (docs/adr/0029). Empty = the child inherits
 * ours, which is what a developer run has always done.
 */
const SERVER_NODE_OPTIONS = (process.env['PERF_SERVER_NODE_OPTIONS'] || '').trim();
const REQUEST_TIMEOUT_MS = Number(process.env['PERF_TIMEOUT_MS']) || 120_000;
const SERVER_START_TIMEOUT_MS = Number(process.env['PERF_SERVER_TIMEOUT_MS']) || 60_000;
const PORT = Number(process.env.PORT) || 4001;
// Attached mode: the API root to measure, trailing slash trimmed so
// https://host/api/v1 and https://host/api/v1/ behave identically. Null = the
// suite spawns and measures its own server on localhost (managed mode).
const ATTACHED_BASE_URL = BASE_URL_FROM_SHELL.length > 0 ? BASE_URL_FROM_SHELL.replace(/\/+$/, '') : null;
const BASE_URL = ATTACHED_BASE_URL ?? `http://localhost:${PORT}`;
// A deployed target is not booting: nothing was just spawned, so one probe with
// a generous budget is the whole precondition — no polling loop.
const READY_PROBE_TIMEOUT_MS = 10_000;
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

/*
 * Git metadata, or the build-time value baked in its place. There is no `git`
 * and no .git in the perf image — .dockerignore excludes it — so a container
 * run falls back to PERF_GIT_SHA/PERF_GIT_BRANCH, set from build args
 * (docs/adr/0029). That is the semantically right value rather than a
 * workaround: ADR 0024 notes the recorded sha describes *the suite*, and in a
 * container the suite is the image. `diff.ts` never compares these fields — they
 * name result files and head the reports — so a fallback costs no comparability.
 */
const git = (args: string, fallback: string): string => {
  try {
    return execSync(`git ${args}`, { cwd: BACKEND_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
};

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

/*
 * Refuses to measure anything when the run is required to publish but has
 * nowhere to publish to. A precondition rather than a check at the end: the
 * upload is the only durable record a container leaves, so discovering the
 * misconfiguration after the measuring is discovering it too late — the work is
 * spent and unrecoverable (docs/adr/0029).
 */
const validatePublishTarget = (): void => {
  if (isPerfPublishRequired() && !isPerfPublishEnabled()) {
    throw new RunAbort(
      'PERF_REQUIRE_PUBLISH=true but STORAGE_MODE is not s3, so the results could not be published anywhere. ' +
        'Set STORAGE_MODE=s3 (with the S3_* variables), or unset PERF_REQUIRE_PUBLISH to keep results on local disk only.',
    );
  }
};

const parseEndpointFilter = (): PerfEndpoint | null => {
  const raw = (process.env['PERF_ENDPOINT'] || '').trim();
  if (raw.length === 0) return null;
  if (!(ENDPOINT_OPTIONS as readonly string[]).includes(raw)) {
    throw new RunAbort(`Unknown PERF_ENDPOINT: ${raw} — available: ${ENDPOINT_OPTIONS.join(', ')}`);
  }
  return raw as PerfEndpoint;
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
// Requests
// ---------------------------------------------------------------------------

const BYPASS_HEADERS: Record<string, string> = CACHE_BYPASS ? { [CACHE_BYPASS_HEADER]: CACHE_BYPASS_SECRET } : {};

/**
 * Every request the suite makes goes through here, so the bypass header cannot
 * be forgotten on one call path — including the untimed ones. That is not merely
 * for consistency: a warm target could answer the GET /datasets data
 * fingerprint from cache with counts that no longer describe its data,
 * defeating the one guarantee the fingerprint exists to provide (docs/adr/0028).
 */
const perfFetch = (url: string, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { ...init, headers: { ...((init.headers as Record<string, string> | undefined) ?? {}), ...BYPASS_HEADERS } });

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/** Rejects a PERF_BASE_URL that is not an absolute http(s) URL, before anything is measured. */
const validateAttachedTarget = (): void => {
  if (ATTACHED_BASE_URL === null) return;
  let parsed: URL;
  try {
    parsed = new URL(ATTACHED_BASE_URL);
  } catch {
    throw new RunAbort(`PERF_BASE_URL is not a valid absolute URL: ${ATTACHED_BASE_URL}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RunAbort(`PERF_BASE_URL must be an http(s) URL, got ${parsed.protocol}//`);
  }
};

/**
 * Rejects incoherent bypass configuration before anything is measured. A warmup
 * request cannot warm a cache it is forbidden to write to, so the combination is
 * contradictory rather than merely pointless (docs/adr/0024 already notes warmup
 * loses its point in attached mode) — and it is rejected the way an unknown
 * PERF_ENDPOINT is, not silently accepted.
 */
const validateCacheBypass = (): void => {
  if (!CACHE_BYPASS) return;
  if (CACHE_BYPASS_SECRET.length === 0) {
    throw new RunAbort(
      "PERF_CACHE_BYPASS=true but PERF_CACHE_BYPASS_SECRET is empty — set it in backend/.env to the target's CACHE_BYPASS_SECRET. " +
        'Without it the target ignores the header and the run would silently measure a warm cache.',
    );
  }
  if (WARMUP) {
    throw new RunAbort(
      'PERF_WARMUP=true cannot be combined with PERF_CACHE_BYPASS=true: a warmup request cannot warm a cache the run is bypassing.',
    );
  }
};

/**
 * Positive proof that the target honoured the bypass, checked before a single
 * row is measured. Without it, a target whose secret is misconfigured, whose
 * build predates the feature, or that sits behind a proxy stripping unknown
 * headers returns an ordinary 200, and the run would record cacheBypass: true
 * over numbers measured against a warm cache — every one wrong in the same
 * direction, and pairable with genuinely cold runs. A 403 on a bad secret could
 * not detect the latter two cases, hence the echo (docs/adr/0028). This is a
 * precondition failure, so it aborts rather than warning: the alternative is
 * learning the run was invalid after paying for all of it.
 */
const verifyCacheBypassHonoured = async (): Promise<void> => {
  if (!CACHE_BYPASS) return;
  const url = `${BASE_URL}/ready`;
  let res: Response;
  try {
    res = await perfFetch(url, { signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS) });
  } catch (err) {
    throw new RunAbort(`Could not verify the cache bypass against ${url} (${(err as Error).message})`);
  }
  const echoed = res.headers.get(CACHE_BYPASS_HEADER);
  if (echoed !== CACHE_BYPASS_APPLIED_VALUE) {
    throw new RunAbort(
      `The target did not confirm the cache bypass: GET ${url} answered ${res.status} without ` +
        `${CACHE_BYPASS_HEADER}: ${CACHE_BYPASS_APPLIED_VALUE}${echoed === null ? '' : ` (got "${echoed}")`}. ` +
        "Either PERF_CACHE_BYPASS_SECRET does not match the target's CACHE_BYPASS_SECRET, the target has none configured, " +
        'its build predates the header, or something between here and it strips unknown headers. ' +
        'Continuing would record cold-cache results for a warm run.',
    );
  }
  console.log('Cache bypass confirmed by the target');
};

/**
 * Attached-mode precondition. Returns null when the target is ready, otherwise a
 * description of why it is not. Localhost is a legitimate target here: attaching
 * to a server you started yourself is the only way to measure a dev server.
 */
const probeTargetReady = async (): Promise<string | null> => {
  try {
    const res = await perfFetch(`${BASE_URL}/ready`, { signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS) });
    return res.ok ? null : `responded ${res.status}`;
  } catch (err) {
    return (err as Error).message;
  }
};

const isServerResponding = async (): Promise<boolean> => {
  try {
    const res = await perfFetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2_000) });
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
    // The child is the system under test, so its heap is part of what is being
    // measured and must be settable independently of ours (see
    // SERVER_NODE_OPTIONS).
    env: { ...process.env, ...(SERVER_NODE_OPTIONS.length > 0 ? { NODE_OPTIONS: SERVER_NODE_OPTIONS } : {}) },
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
      const res = await perfFetch(`${BASE_URL}/ready`, { signal: AbortSignal.timeout(2_000) });
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

/**
 * Data fingerprint read through the API, collected in both modes so managed and
 * attached runs carry the same field. In attached mode it is the *only* data
 * signal available, hence the abort on failure — the same reasoning that makes
 * getDbCounts fatal: a run whose comparability cannot be established is worse
 * than no run, because the diff would report agreement it never verified.
 *
 * `n_observations` is a stored column that the bulk-load UpdateDatasetMetadata
 * job rewrites, so it tracks data volume the way the DB row counts do. The
 * response covers exactly the measured surface: the suite runs unauthenticated,
 * so the datasets this call sees are the datasets the measurement can reach.
 */
const getDatasetsFingerprint = async (): Promise<DatasetFingerprint[]> => {
  const url = `${BASE_URL}/datasets`;
  const sample = await timedRequest('GET', url, null, 200, 'data fingerprint');
  if (sample.error !== null) {
    throw new RunAbort(
      `Could not read GET ${url} for the data fingerprint (${sample.error}). ` +
        'The fingerprint is what makes runs comparable, so the suite refuses to continue without it.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sample.bodyText);
  } catch {
    throw new RunAbort(`GET ${url} did not return JSON, so no data fingerprint could be recorded`);
  }
  if (!Array.isArray(parsed)) {
    throw new RunAbort(`GET ${url} did not return an array, so no data fingerprint could be recorded`);
  }
  // Sorted by id so the fingerprint compares stably regardless of response order
  return (parsed as { id?: string; n_observations?: string | null; n_raster_layers?: number | null; updated_at?: string | null }[])
    .filter(dataset => typeof dataset.id === 'string')
    .map(dataset => ({
      id: dataset.id!,
      n_observations: dataset.n_observations ?? null,
      n_raster_layers: dataset.n_raster_layers ?? null,
      updated_at: dataset.updated_at ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};

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
    response = await perfFetch(url, init);
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
): Promise<{ row: ResultRow; warmup: Sample | null; samples: Sample[] }> => {
  const key = rowKey(meta.method, meta.pathTemplate, meta.asset, meta.paramsVariant, meta.daiResolution);
  console.log(`  ${key}`);
  const warmup = WARMUP ? await request() : null;
  const samples: Sample[] = [];
  // Fail fast: the same request is repeated verbatim, so an error is
  // deterministic — further iterations would only burn timeout budget and
  // persist more junk filters. A failed warmup skips the timed loop entirely.
  if (warmup === null || warmup.error === null) {
    for (let i = 0; i < ITERATIONS; i++) {
      const sample = await request();
      samples.push(sample);
      if (sample.error !== null) break;
    }
  }
  const successful = samples.filter(s => s.error === null);
  const errors = samples.map(s => s.error).filter((e): e is string => e !== null);
  if (warmup !== null && warmup.error !== null) {
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
  validatePublishTarget();
  validateAttachedTarget();
  validateCacheBypass();
  const endpointFilter = parseEndpointFilter();
  const assets = discoverAssets();
  const gitSha = git('rev-parse HEAD', (process.env['PERF_GIT_SHA'] || 'unknown').trim());
  const gitBranch = git('rev-parse --abbrev-ref HEAD', (process.env['PERF_GIT_BRANCH'] || 'unknown').trim());
  // An image is built from a committed tree, so false is a fact about it rather
  // than a default: with no working tree there is nothing that could be dirty.
  const gitDirty = git('status --porcelain', '') !== '';
  const timestamp = new Date().toISOString();

  // The target is stated up front, before any measuring: it decides what the run
  // means and where its writes land.
  console.log(
    ATTACHED_BASE_URL === null
      ? `Target: ${BASE_URL} (server spawned and managed by the suite)`
      : `Target: ${ATTACHED_BASE_URL} (attached via PERF_BASE_URL — server not managed by the suite, caches uncontrolled)`,
  );
  if (CACHE_BYPASS) {
    console.log(
      'Cache bypass: ON — every request carries the bypass header, so the target answers nothing from its query cache. ' +
        'Its database performs the full work of every iteration; against a shared environment this is a load-generating run.',
    );
  }
  console.log(
    `Performance suite: ${assets.length} asset(s)${ASSET_FILTER.length > 0 ? ' (selected via PERF_ASSETS)' : ''}, ${ITERATIONS} iterations/row, warmup ${WARMUP ? 'on' : 'off'}, DAI resolutions [${DAI_RESOLUTIONS.join(', ')}]${endpointFilter ? `, endpoint=${endpointFilter} (selected via PERF_ENDPOINT)` : ''}`,
  );

  let child: ChildProcess | null = null;
  let outputTail: () => string = () => '';
  if (ATTACHED_BASE_URL === null) {
    const started = await startServer();
    child = started.child;
    outputTail = started.outputTail;
    console.log(`Server ready on ${BASE_URL}`);
  } else {
    const notReady = await probeTargetReady();
    if (notReady !== null) {
      throw new RunAbort(
        `GET ${BASE_URL}/ready did not succeed (${notReady}). The suite does not manage this server, ` +
          'so a ready target is a precondition rather than something to wait for.',
      );
    }
    console.log(`Target is ready`);
  }
  await verifyCacheBypassHonoured();

  const results: ResultRow[] = [];
  try {
    // No DB fingerprint in attached mode: the target's database is not reachable
    // from here, which is the whole reason for measuring through its API
    // (docs/adr/0024). The API-derived fingerprint carries both modes.
    const dbCounts = ATTACHED_BASE_URL === null ? await getDbCounts() : null;
    const datasetsFingerprint = await getDatasetsFingerprint();

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
        const filterId = [...(warmup ? [warmup] : []), ...samples]
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
      // With a PERF_ENDPOINT selection the plain GET-by-id ('') and the
      // unselected endpoints drop out.
    ].filter(t => endpointFilter === null || t.suffix === `/${endpointFilter}`);
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
            datasetsBody = [...(warmup ? [warmup] : []), ...samples].find(s => s.error === null)?.bodyText;
          }
        }

        // /soil-data consumes the dataset ids from the /datasets response; in
        // soil-data-only mode that row is not measured, so fetch it once
        // untimed as a prerequisite instead.
        if (endpointFilter === 'soil-data' && filterId) {
          const prerequisite = await timedRequest(
            'GET',
            `${BASE_URL}/data-filters/${filterId}/datasets`,
            null,
            200,
            `${context} untimed prerequisite for /soil-data`,
          );
          if (prerequisite.error === null) {
            datasetsBody = prerequisite.bodyText;
          }
        }

        // GET /soil-data with the dataset ids extracted from the /datasets response
        if (endpointFilter === null || endpointFilter === 'soil-data') {
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
        }
        const daiResolutions = endpointFilter === null || endpointFilter === 'dai' ? DAI_RESOLUTIONS : [];
        for (const resolution of daiResolutions) {
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
        // Omitted for managed runs, so pre-existing result files (which predate
        // the field) classify as the same target rather than as an unknown one.
        ...(ATTACHED_BASE_URL === null ? {} : { baseUrl: ATTACHED_BASE_URL }),
        gitSha,
        gitBranch,
        gitDirty,
        nodeVersion: process.version,
        iterations: ITERATIONS,
        daiResolutions: DAI_RESOLUTIONS,
        ...(endpointFilter ? { endpoint: endpointFilter } : {}),
        // Omitted rather than false for warm runs, so result files predating the
        // field classify as warm; diff.ts pairs on it as well as on the target.
        ...(CACHE_BYPASS ? { cacheBypass: true } : {}),
        assets: assetFingerprints,
        ...(dbCounts === null ? {} : { db: dbCounts }),
        datasets: datasetsFingerprint,
      },
      results,
      totals: {
        requests: results.reduce((acc, r) => acc + r.durationsMs.length, 0),
        wallClockMs: performance.now() - wallClockStart,
      },
    };

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const runId = `${fileTimestamp(timestamp)}-${gitSha.slice(0, 7)}`;
    const jsonPath = path.join(RESULTS_DIR, `${runId}.json`);
    const htmlPath = path.join(RESULTS_DIR, `${runId}.html`);
    fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2));
    fs.writeFileSync(htmlPath, renderRunHtml(run));
    // After both files exist, so a publish failure can never cost us the run.
    const published = await publishPerfArtifacts([jsonPath, htmlPath]);
    if (!published && isPerfPublishRequired()) {
      console.error('\n✗ PERF_REQUIRE_PUBLISH=true and the artifacts were not all published — this run leaves no durable record.');
      process.exitCode = 1;
    }

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
    // Only a server the suite spawned has output to show; an attached target's
    // logs live wherever it is deployed.
    if (!(err instanceof RunAbort) && child !== null) {
      console.error(`\n--- server output ---\n${outputTail()}`);
    }
    throw err;
  } finally {
    if (child !== null) {
      await stopServer(child);
    }
  }
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(err => {
    console.error(`\nPerformance run aborted: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
