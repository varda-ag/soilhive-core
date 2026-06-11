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

export interface Fingerprint {
  timestamp: string;
  gitSha: string;
  gitBranch: string;
  gitDirty: boolean;
  nodeVersion: string;
  iterations: number;
  daiResolutions: number[];
  assets: AssetFingerprint[];
  db: Record<string, number>;
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
