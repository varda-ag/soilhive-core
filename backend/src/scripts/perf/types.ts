export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
}

export interface ResultRow {
  /** Stable identity of the measurement, used to match rows between runs. */
  key: string;
  method: string;
  pathTemplate: string;
  asset: string;
  paramsVariant: string;
  daiResolution: number | null;
  /**
   * Id of the data filter the row's requests ran against, so any row can be
   * reproduced by hand: for GET rows the id in the request URL, for POST rows
   * the id extracted from the first successful response (the one the GET
   * phase reuses). Null when no filter was obtained; absent in result files
   * recorded before the field existed.
   */
  filterId?: string | null;
  expectedStatus: number;
  /** One entry per timed sample; 0 means the request failed before a response arrived. */
  statusCodes: number[];
  /**
   * One entry per failed sample; empty when every sample returned the expected
   * status. For rows that were not exercised at all (statusCodes empty), holds
   * a single skip reason instead — with `ok: true` when the skip is a
   * legitimate data-dependent outcome rather than a failure.
   */
  errors: string[];
  durationsMs: number[];
  responseBytes: number[];
  /** Computed over successful samples only; null when no sample succeeded. */
  stats: LatencyStats | null;
  meanResponseBytes: number | null;
  ok: boolean;
}

export interface AssetFingerprint {
  name: string;
  file: string;
  sha256: string;
  sizeBytes: number;
  paramsVariants: { variant: string; sha256: string }[];
}

/**
 * Per-dataset entry of the API-derived data fingerprint (docs/adr/0024). Field
 * names mirror the API response rather than being camel-cased, so a fingerprint
 * entry can be compared against `GET /datasets` output by eye.
 */
export interface DatasetFingerprint {
  /** The dataset's slug, as the API reports it. */
  id: string;
  /** Stored observation count; a bigint the API serialises as a string. */
  n_observations: string | null;
  n_raster_layers: number | null;
  updated_at: string | null;
}

export interface Fingerprint {
  timestamp: string;
  /**
   * API root the run measured, as passed via PERF_BASE_URL. Absent for runs
   * that measured a server the suite spawned itself on localhost (and in
   * result files recorded before the field existed) — so an absent value means
   * the local managed target, not an unknown one.
   */
  baseUrl?: string;
  gitSha: string;
  gitBranch: string;
  gitDirty: boolean;
  nodeVersion: string;
  iterations: number;
  daiResolutions: number[];
  /**
   * Single endpoint the run was restricted to via PERF_ENDPOINT; absent for
   * full-suite runs (and in result files recorded before the field existed).
   */
  endpoint?: string;
  assets: AssetFingerprint[];
  /**
   * Row counts read straight from Postgres. Absent when PERF_BASE_URL pointed
   * the run at a deployed target, whose database is not reachable from here
   * (docs/adr/0024). An absent value must be reported as such, never treated
   * as agreement between two runs.
   */
  db?: Record<string, number>;
  /**
   * True when the run sent the cache-bypass header on every request, so its
   * rows measure cold application work (docs/adr/0028). Absent — rather than
   * false — for ordinary warm runs, so result files predating the field
   * classify as warm rather than as unknown, and PERF_RUN_VERSION stays put.
   * A bypassed run is not comparable to a warm one against the same target,
   * which is why diff.ts pairs on it as well as on baseUrl.
   */
  cacheBypass?: boolean;
  /**
   * Data fingerprint derived from GET /datasets — the API-visible substitute
   * for `db`, and the only data signal a run against a deployed target has.
   * Absent in result files recorded before the field existed.
   */
  datasets?: DatasetFingerprint[];
}

export interface PerfRun {
  version: number;
  fingerprint: Fingerprint;
  results: ResultRow[];
  totals: { requests: number; wallClockMs: number };
}

export const PERF_RUN_VERSION = 2;

export const rowKey = (
  method: string,
  pathTemplate: string,
  asset: string,
  paramsVariant: string,
  daiResolution: number | null,
): string => {
  const base = `${method} ${pathTemplate} | asset=${asset} | params=${paramsVariant}`;
  return daiResolution === null ? base : `${base} | res=${daiResolution}`;
};

const percentile = (sorted: number[], p: number): number => {
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low]!;
  const highValue = sorted[high]!;
  return lowValue + (highValue - lowValue) * (rank - low);
};

export const computeStats = (durationsMs: number[]): LatencyStats => {
  if (durationsMs.length === 0) {
    throw new Error('Cannot compute stats over zero samples');
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: sum / sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
};
