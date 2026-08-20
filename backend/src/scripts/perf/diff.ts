/*
 * Compares two performance run JSON files (produced by runner.ts) and writes
 * an HTML diff report. Rows are matched by their stable key (method + path
 * template + asset + params variant + DAI resolution); a row is flagged as a
 * regression/improvement when its median latency moved by more than
 * PERF_DIFF_THRESHOLD (default 0.15 = 15%). Fingerprint mismatches between the
 * two runs are surfaced as a warning banner, since they mean the comparison
 * may reflect data/environment changes rather than code changes.
 *
 * Runs need not cover the same assets: rows present in both runs are compared,
 * rows present in only one are listed as added/removed.
 *
 * Usage: npm run perf:diff [-- <baseline.json> <current.json> [output.html]]
 * Without arguments, the most recent run is compared against the most recent
 * older run that measured the *same target* — runs against different targets
 * (localhost versus a deployed environment reached via PERF_BASE_URL) measure
 * different systems, so they are neither paired by default nor comparable when
 * paired by hand. A bypassed run pairs only with another bypassed run, for the
 * same reason (docs/adr/0028).
 *
 * With STORAGE_MODE=s3 the report is also uploaded to
 * s3://$S3_STORAGE_BUCKET/perf-results/ alongside the runs it compares. Its
 * default name leads with the current run's timestamp, so it is unique per pair
 * and sorts next to the run it describes.
 *
 * `--after-run` is the mode the perf image's entrypoint uses, and it inverts two
 * of the assumptions above (docs/adr/0029). The current run is the newest local
 * file — runner.ts has just written it — but the *baseline* is looked up in the
 * results bucket, because a container's local directory is not a run history: it
 * holds that one file and nothing else. And "no eligible baseline" stops being
 * an error, since it is exactly what a first scheduled run against a target
 * looks like; a bucket that cannot be read still fails, because confusing the
 * two would let a revoked permission pass for a fresh start indefinitely.
 *
 * PERF_DIFF_FAIL_ON_REGRESSION=true additionally makes this process exit
 * non-zero on newly failing rows and on regressions beyond
 * PERF_DIFF_FAIL_THRESHOLD — a second, higher threshold than the report's
 * PERF_DIFF_THRESHOLD, for the reason given at its declaration. Off by default:
 * a developer's diff reports, it does not judge.
 */
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, formatBytes, formatMs, PAGE_CSS, renderFingerprintHtml } from './report';
import { fetchPerfArtifact, isPerfPublishEnabled, isPerfPublishRequired, listPerfRunNames, publishPerfArtifacts } from './publish';
import { Fingerprint, fileTimestamp, LatencyStats, PERF_RUN_VERSION, PerfRun, ResultRow } from './types';

const THRESHOLD = Number(process.env['PERF_DIFF_THRESHOLD']) || 0.15;

/*
 * Whether a regression makes this process exit non-zero. Off by default, so a
 * developer's diff still just prints a report. A schedule turns it on — the
 * image deliberately does not, since whether a regression should page someone
 * is the schedule's policy, not a property of the image (docs/adr/0029).
 */
const FAIL_ON_REGRESSION = process.env['PERF_DIFF_FAIL_ON_REGRESSION'] === 'true';

/*
 * The threshold that decides the *exit code*, deliberately separate from
 * THRESHOLD, which decides how rows are coloured in the report. One knob cannot
 * do both jobs: raising it to stop a noisy schedule from flapping would also
 * stop the report from highlighting the regressions it is meant to show. The
 * noise floor is the operator's to measure — PERF_ITERATIONS=1 makes a median a
 * single sample, and consecutive attached-mode iterations may land on nodes in
 * different cache states (docs/adr/0024).
 */
const FAIL_THRESHOLD = Number(process.env['PERF_DIFF_FAIL_THRESHOLD']) || 0.3;

/*
 * How far back through the published runs to look for a baseline. The bucket is
 * shared by every target and both cache modes, so the newest file is very often
 * not an eligible pair; the cap is what stops "no eligible baseline" from
 * turning into an unbounded download of run history.
 */
const S3_LOOKBACK = Number(process.env['PERF_DIFF_LOOKBACK']) || 25;

/**
 * Selects the mode the perf image's entrypoint uses: diff the run that just
 * finished against the newest eligible earlier one, wherever it lives, and treat
 * "there isn't one" as a normal outcome rather than an error.
 */
const AFTER_RUN_FLAG = '--after-run';

type RowClass = 'regression' | 'improvement' | 'neutral';

interface ComparedRow {
  baseline: ResultRow;
  current: ResultRow;
  baselineStats: LatencyStats;
  currentStats: LatencyStats;
  medianDelta: number;
  sizeDelta: number;
  rowClass: RowClass;
}

/** Matched rows where at least one side has no successful samples — no latency comparison possible. */
interface IncomparableRow {
  baseline: ResultRow;
  current: ResultRow;
}

const RESULTS_DIR = path.resolve(__dirname, '..', '..', '..', 'perf-results');

/**
 * The system a run measured. An absent baseUrl means the local server the suite
 * spawns itself — which is also how result files predating the field read, so
 * they classify correctly rather than as an unknown target.
 */
const targetOf = (fp: Fingerprint): string => fp.baseUrl ?? 'localhost (server managed by the suite)';

/** How the run related to the query cache; absent means an ordinary warm run. */
const cacheModeOf = (fp: Fingerprint): string => (fp.cacheBypass ? 'cache bypassed' : 'cache warm');

/**
 * What makes two runs an eligible default pair. The target alone is not enough:
 * a bypassed run and a warm run against the same deployment share a baseUrl, so
 * pairing on target only would diff cold against warm and report the bypass as
 * a catastrophic regression (docs/adr/0028).
 */
const pairingKeyOf = (fp: Fingerprint): string => `${targetOf(fp)} — ${cacheModeOf(fp)}`;

/**
 * Zero-argument default: the newest run, paired with the newest *older run that
 * measured the same target the same way* — same system, and cold or warm alike
 * (see pairingKeyOf). Taking the last two files outright would happily diff a
 * run against a deployed environment with yesterday's localhost run, and a
 * warning on a report you did not want is not a fix (docs/adr/0024).
 *
 * Run files are named <ISO-timestamp>-<sha>.json, so a lexicographic sort is
 * chronological. Candidates that fail to load are skipped: walking backwards
 * touches older files than the previous "last two" rule did, and one
 * incompatible leftover in the directory must not break the default comparison.
 */
const localRunFiles = (): string[] =>
  fs.existsSync(RESULTS_DIR)
    ? fs
        .readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
    : [];

/**
 * Newest local run older than `files[from]` whose pairing key matches, or null.
 * Candidates that fail to load are skipped rather than fatal — see
 * findLastTwoRuns.
 */
const findLocalBaseline = (files: string[], from: number, pairingKey: string): string | null => {
  for (let i = from; i >= 0; i--) {
    const candidateFile = path.join(RESULTS_DIR, files[i]!);
    try {
      if (pairingKeyOf(loadRun(candidateFile).fingerprint) === pairingKey) {
        return candidateFile;
      }
    } catch {
      // Unreadable or incompatible run file — not a candidate baseline
    }
  }
  return null;
};

const findLastTwoRuns = (): [string, string] => {
  const files = localRunFiles();
  if (files.length < 2) {
    throw new Error(`Need at least two run files in ${RESULTS_DIR} to compare without arguments (found ${files.length})`);
  }
  const currentFile = path.join(RESULTS_DIR, files[files.length - 1]!);
  const pairingKey = pairingKeyOf(loadRun(currentFile).fingerprint);
  const baselineFile = findLocalBaseline(files, files.length - 2, pairingKey);
  if (baselineFile !== null) {
    return [baselineFile, currentFile];
  }
  throw new Error(
    `No earlier run matching "${pairingKey}" found in ${RESULTS_DIR} to compare ${path.basename(currentFile)} with — ` +
      'pass a baseline and a current file explicitly',
  );
};

/**
 * Newest *published* run that pairs with `pairingKey`, downloaded into
 * RESULTS_DIR, or null when the bucket holds none within PERF_DIFF_LOOKBACK.
 *
 * This walk exists because the local directory is not the run history in a
 * container: it holds exactly the run just written (docs/adr/0029). It mirrors
 * findLocalBaseline deliberately — same reverse-chronological order, same
 * skip-on-unloadable rule, same pairingKeyOf — so a change to what makes two
 * runs comparable has to be made in both places.
 *
 * `excludeName` is the current run, which runner.ts has already published by the
 * time this runs, so it is normally the *first* entry in the listing.
 *
 * Candidates that did not match are left in RESULTS_DIR rather than cleaned up.
 * They are genuine run files named by their own timestamps, so they sort
 * correctly and a later local diff can legitimately use them; in a container the
 * directory is discarded with the process anyway.
 *
 * Errors from the bucket are not caught: "cannot list" and "nothing to pair
 * with" are different outcomes and only the second is benign.
 */
const findPublishedBaseline = async (pairingKey: string, excludeName: string): Promise<string | null> => {
  const names = (await listPerfRunNames()).filter(name => name !== excludeName);
  if (names.length === 0) {
    return null;
  }
  for (const name of names.slice(0, S3_LOOKBACK)) {
    let candidateFile: string;
    try {
      candidateFile = await fetchPerfArtifact(name, RESULTS_DIR);
    } catch (err) {
      // A single unreadable object should not end the walk; a broken bucket
      // will fail the listing above instead.
      console.warn(`⚠ Could not download ${name}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    try {
      if (pairingKeyOf(loadRun(candidateFile).fingerprint) === pairingKey) {
        return candidateFile;
      }
    } catch {
      // Incompatible run file (a PERF_RUN_VERSION bump, say) — not a candidate
    }
  }
  return null;
};

/**
 * Resolves the pair for --after-run: the newest local run is the current one,
 * since runner.ts has just written it, and the baseline is the newest eligible
 * run from the local directory if there is one, else from the bucket. Returns
 * null for the baseline when nothing pairs, which is the ordinary state of a
 * first run against a target — see main().
 */
const findPairAfterRun = async (): Promise<{ currentFile: string; baselineFile: string | null; pairingKey: string }> => {
  const files = localRunFiles();
  if (files.length === 0) {
    throw new Error(`No run file found in ${RESULTS_DIR} — --after-run expects the run it follows to have written one`);
  }
  const currentName = files[files.length - 1]!;
  const currentFile = path.join(RESULTS_DIR, currentName);
  const pairingKey = pairingKeyOf(loadRun(currentFile).fingerprint);
  const localBaseline = findLocalBaseline(files, files.length - 2, pairingKey);
  if (localBaseline !== null) {
    return { currentFile, baselineFile: localBaseline, pairingKey };
  }
  if (!isPerfPublishEnabled()) {
    return { currentFile, baselineFile: null, pairingKey };
  }
  return { currentFile, baselineFile: await findPublishedBaseline(pairingKey, currentName), pairingKey };
};

const loadRun = (file: string): PerfRun => {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
  const run = JSON.parse(fs.readFileSync(file, 'utf8')) as PerfRun;
  if (run.version !== PERF_RUN_VERSION) {
    throw new Error(`${file} has version ${run.version}, expected ${PERF_RUN_VERSION}`);
  }
  return run;
};

const relativeDelta = (baseline: number, current: number): number =>
  baseline === 0 ? (current === 0 ? 0 : Infinity) : (current - baseline) / baseline;

/** Names the run(s) for which a fingerprint field was not collected. */
const missingIn = (absentInBaseline: boolean, absentInCurrent: boolean): string =>
  [absentInBaseline ? 'baseline' : null, absentInCurrent ? 'current' : null].filter(Boolean).join(' and ');

/**
 * Differences in the API-derived data fingerprint (docs/adr/0024) — the only
 * data signal an attached run has. Returns nothing when either side lacks it;
 * whether that absence matters depends on the DB counts, so the caller decides.
 */
const datasetMismatches = (fpA: Fingerprint, fpB: Fingerprint): string[] => {
  if (fpA.datasets === undefined || fpB.datasets === undefined) return [];
  const mismatches: string[] = [];
  const byId = new Map(fpA.datasets.map(dataset => [dataset.id, dataset]));
  for (const current of fpB.datasets) {
    const baseline = byId.get(current.id);
    if (!baseline) {
      mismatches.push(`dataset ${current.id}: only in current run`);
      continue;
    }
    if (baseline.n_observations !== current.n_observations) {
      mismatches.push(`dataset ${current.id}: n_observations ${baseline.n_observations ?? 'n/a'} vs ${current.n_observations ?? 'n/a'}`);
    }
    if (baseline.n_raster_layers !== current.n_raster_layers) {
      mismatches.push(`dataset ${current.id}: n_raster_layers ${baseline.n_raster_layers ?? 'n/a'} vs ${current.n_raster_layers ?? 'n/a'}`);
    }
    if (baseline.updated_at !== current.updated_at) {
      mismatches.push(`dataset ${current.id}: updated_at ${baseline.updated_at ?? 'n/a'} vs ${current.updated_at ?? 'n/a'}`);
    }
  }
  const currentIds = new Set(fpB.datasets.map(dataset => dataset.id));
  for (const baseline of fpA.datasets) {
    if (!currentIds.has(baseline.id)) {
      mismatches.push(`dataset ${baseline.id}: only in baseline run`);
    }
  }
  return mismatches;
};

const fingerprintMismatches = (a: PerfRun, b: PerfRun): string[] => {
  const mismatches: string[] = [];
  const fpA = a.fingerprint;
  const fpB = b.fingerprint;
  // The measured system is as much a fingerprint as the data is: comparing a
  // localhost run to a deployed one compares two different systems.
  if (targetOf(fpA) !== targetOf(fpB)) {
    mismatches.push(`target: ${targetOf(fpA)} vs ${targetOf(fpB)}`);
  }
  if (cacheModeOf(fpA) !== cacheModeOf(fpB)) {
    mismatches.push(`cache mode: ${cacheModeOf(fpA)} vs ${cacheModeOf(fpB)}`);
  }
  if (fpA.iterations !== fpB.iterations) {
    mismatches.push(`iterations: ${fpA.iterations} vs ${fpB.iterations}`);
  }
  if (fpA.daiResolutions.join(',') !== fpB.daiResolutions.join(',')) {
    mismatches.push(`DAI resolutions: [${fpA.daiResolutions}] vs [${fpB.daiResolutions}]`);
  }
  if ((fpA.endpoint ?? 'full suite') !== (fpB.endpoint ?? 'full suite')) {
    mismatches.push(`endpoint selection: ${fpA.endpoint ?? 'full suite'} vs ${fpB.endpoint ?? 'full suite'}`);
  }
  if (fpA.nodeVersion !== fpB.nodeVersion) {
    mismatches.push(`node version: ${fpA.nodeVersion} vs ${fpB.nodeVersion}`);
  }
  /*
   * The two data signals are reported together, because what matters is whether
   * *either* established comparability. Absence must never be read as agreement:
   * iterating the union of table keys when a side has no counts at all would
   * find nothing to compare and stay silent, which is exactly the false
   * confidence this report exists to prevent (docs/adr/0024). Conversely, a
   * missing dataset fingerprint is only worth reporting when the stronger DB
   * counts are not available on both sides — otherwise every diff against a
   * baseline recorded before that field existed would carry a mismatch that
   * tells the reader nothing.
   */
  const dbComparable = fpA.db !== undefined && fpB.db !== undefined;
  const datasetsComparable = fpA.datasets !== undefined && fpB.datasets !== undefined;
  if (dbComparable) {
    const tables = new Set([...Object.keys(fpA.db!), ...Object.keys(fpB.db!)]);
    for (const table of tables) {
      if (fpA.db![table] !== fpB.db![table]) {
        mismatches.push(`DB ${table} count: ${fpA.db![table] ?? 'n/a'} vs ${fpB.db![table] ?? 'n/a'}`);
      }
    }
  } else {
    mismatches.push(
      `DB row counts: not collected for the ${missingIn(fpA.db === undefined, fpB.db === undefined)} run — ` +
        (datasetsComparable
          ? 'comparability rests on the dataset fingerprint alone'
          : 'and no dataset fingerprint either, so the data behind the two runs is unverified'),
    );
  }
  if (!datasetsComparable && !dbComparable) {
    mismatches.push(`dataset fingerprint: not recorded in the ${missingIn(fpA.datasets === undefined, fpB.datasets === undefined)} run`);
  }
  mismatches.push(...datasetMismatches(fpA, fpB));
  const assetsA = new Map(fpA.assets.map(asset => [asset.name, asset]));
  for (const assetB of fpB.assets) {
    const assetA = assetsA.get(assetB.name);
    if (!assetA) {
      mismatches.push(`asset ${assetB.name}: only in current run`);
    } else if (assetA.sha256 !== assetB.sha256) {
      mismatches.push(`asset ${assetB.name}: content changed`);
    }
  }
  for (const assetA of fpA.assets) {
    if (!fpB.assets.some(assetB => assetB.name === assetA.name)) {
      mismatches.push(`asset ${assetA.name}: only in baseline run`);
    }
  }
  return mismatches;
};

const formatDelta = (delta: number): string => {
  if (!Number.isFinite(delta)) return 'n/a';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${(delta * 100).toFixed(1)}%`;
};

const comparedRowHtml = (row: ComparedRow): string => {
  const { baseline, current, baselineStats, currentStats } = row;
  const sizes =
    baseline.meanResponseBytes === null || current.meanResponseBytes === null
      ? '—'
      : `${formatBytes(baseline.meanResponseBytes)} → ${formatBytes(current.meanResponseBytes)} (${formatDelta(row.sizeDelta)})`;
  const cells = [
    `<td>${escapeHtml(current.asset)}</td>`,
    `<td>${escapeHtml(current.paramsVariant)}</td>`,
    `<td class="num">${current.daiResolution ?? ''}</td>`,
    `<td>${current.filterId ? `<code>${escapeHtml(current.filterId)}</code>` : '—'}</td>`,
    `<td class="num">${formatMs(baselineStats.median)}</td>`,
    `<td class="num">${formatMs(currentStats.median)}</td>`,
    `<td class="num"><strong>${formatDelta(row.medianDelta)}</strong></td>`,
    `<td class="num">${formatMs(baselineStats.p95)} → ${formatMs(currentStats.p95)}</td>`,
    `<td class="num">${formatMs(baselineStats.mean)} → ${formatMs(currentStats.mean)}</td>`,
    `<td class="num">${sizes}</td>`,
  ];
  return `<tr class="${row.rowClass === 'neutral' ? '' : row.rowClass}">${cells.join('')}</tr>`;
};

const rowStatusSummary = (row: ResultRow): string => {
  if (row.statusCodes.length === 0) return `skipped (${row.errors[0] ?? 'no samples'})`;
  const statuses = [...new Set(row.statusCodes)].join(', ');
  return row.ok ? `ok (${statuses})` : `failed (statuses ${statuses}): ${row.errors[0] ?? ''}`;
};

const incomparableRowHtml = (row: IncomparableRow): string =>
  `<tr class="failed"><td><code>${escapeHtml(row.current.key)}</code></td><td>${escapeHtml(rowStatusSummary(row.baseline))}</td><td>${escapeHtml(
    rowStatusSummary(row.current).slice(0, 300),
  )}</td></tr>`;

const onlyRowHtml = (row: ResultRow, cls: 'added' | 'removed'): string =>
  `<tr class="${cls}"><td><code>${escapeHtml(row.key)}</code></td><td class="num">${row.stats ? formatMs(row.stats.median) : '—'}</td><td>${cls === 'added' ? 'only in current run' : 'only in baseline run'}</td></tr>`;

const endpointLabel = (row: ResultRow): string => `${row.method} ${row.pathTemplate}`;

/**
 * Groups the already-sorted compared rows into one table per endpoint
 * (method + path template). Tables are emitted alphabetically by endpoint;
 * rows within each table keep the incoming order (abs median delta descending).
 */
const comparedTablesHtml = (compared: ComparedRow[]): string => {
  const groups = new Map<string, ComparedRow[]>();
  for (const row of compared) {
    const label = endpointLabel(row.current);
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(row);
  }
  return [...groups.keys()]
    .sort()
    .map(label => {
      const rows = groups.get(label)!;
      return `<h3><code>${escapeHtml(label)}</code> (${rows.length})</h3>
<table>
<thead>
<tr><th>Asset</th><th>Params</th><th>Res</th><th>Filter ID</th><th>Median base</th><th>Median curr</th><th>Δ median</th><th>P95</th><th>Mean</th><th>~Size</th></tr>
</thead>
<tbody>
${rows.map(comparedRowHtml).join('\n')}
</tbody>
</table>`;
    })
    .join('\n');
};

const renderDiffHtml = (
  baseline: PerfRun,
  current: PerfRun,
  compared: ComparedRow[],
  incomparable: IncomparableRow[],
  added: ResultRow[],
  removed: ResultRow[],
  mismatches: string[],
): string => {
  const banner =
    mismatches.length === 0
      ? ''
      : `<div class="banner"><strong>⚠ Fingerprint mismatch — latency deltas may reflect environment/data changes, not code changes:</strong><ul>${mismatches
          .map(m => `<li>${escapeHtml(m)}</li>`)
          .join('')}</ul></div>`;
  const incomparableTable =
    incomparable.length === 0
      ? ''
      : `<h2>Rows with failed requests (no latency comparison)</h2>
<table>
<thead><tr><th>Row</th><th>Baseline</th><th>Current</th></tr></thead>
<tbody>
${incomparable.map(incomparableRowHtml).join('\n')}
</tbody>
</table>`;
  const onlyTable =
    added.length === 0 && removed.length === 0
      ? ''
      : `<h2>Rows present in only one run</h2>
<table>
<thead><tr><th>Row</th><th>Median ms</th><th></th></tr></thead>
<tbody>
${[...removed.map(r => onlyRowHtml(r, 'removed')), ...added.map(r => onlyRowHtml(r, 'added'))].join('\n')}
</tbody>
</table>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Performance diff ${escapeHtml(baseline.fingerprint.gitSha.slice(0, 7))} vs ${escapeHtml(current.fingerprint.gitSha.slice(0, 7))}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<h1>Data-filters performance diff</h1>
<p>Median latency changes of ±${(THRESHOLD * 100).toFixed(0)}% or more are flagged as <span style="background:#fdecea">regressions</span> / <span style="background:#e8f5e9">improvements</span>.</p>
${banner}
<h2>Baseline: ${escapeHtml(baseline.fingerprint.gitSha.slice(0, 10))} (${escapeHtml(baseline.fingerprint.timestamp)})</h2>
${renderFingerprintHtml(baseline.fingerprint)}
<h2>Current: ${escapeHtml(current.fingerprint.gitSha.slice(0, 10))} (${escapeHtml(current.fingerprint.timestamp)})</h2>
${renderFingerprintHtml(current.fingerprint)}
<h2>Compared rows (${compared.length})</h2>
${comparedTablesHtml(compared)}
${incomparableTable}
${onlyTable}
</body>
</html>`;
};

const main = async () => {
  const args = process.argv.slice(2);
  // eslint-disable-next-line prefer-const
  let [baselineFile, currentFile, outputFile] = args;
  if (args[0] === AFTER_RUN_FLAG) {
    if (args.length > 1) {
      console.error(`Usage: node dist/scripts/perf/diff.js ${AFTER_RUN_FLAG}`);
      process.exit(1);
    }
    const pair = await findPairAfterRun();
    if (pair.baselineFile === null) {
      /*
       * Not a failure. This is what the first scheduled run of any target looks
       * like, and equally the first run after PERF_BASE_URL changes,
       * PERF_CACHE_BYPASS flips, or PERF_RUN_VERSION is bumped — all deliberate
       * acts. A bucket that could not be *read* threw further up instead
       * (docs/adr/0029).
       */
      console.log(
        `No earlier run matching "${pair.pairingKey}" to compare ${path.basename(pair.currentFile)} with — ` +
          'nothing to diff yet, this run becomes the baseline for the next one.',
      );
      return;
    }
    [baselineFile, currentFile] = [pair.baselineFile, pair.currentFile];
    console.log(`Comparing against the newest eligible earlier run:\n  baseline: ${baselineFile}\n  current:  ${currentFile}`);
  } else if (args.length === 1 || args.length > 3) {
    console.error('Usage: npm run perf:diff [-- <baseline.json> <current.json> [output.html]]');
    process.exit(1);
  } else if (!baselineFile || !currentFile) {
    [baselineFile, currentFile] = findLastTwoRuns();
    console.log(`Comparing the two most recent runs:\n  baseline: ${baselineFile}\n  current:  ${currentFile}`);
  }
  const baseline = loadRun(baselineFile!);
  const current = loadRun(currentFile!);

  const baselineRows = new Map(baseline.results.map(row => [row.key, row]));
  const currentRows = new Map(current.results.map(row => [row.key, row]));

  const compared: ComparedRow[] = [];
  const incomparable: IncomparableRow[] = [];
  for (const [key, currentRow] of currentRows) {
    const baselineRow = baselineRows.get(key);
    if (!baselineRow) continue;
    const baselineStats = baselineRow.stats;
    const currentStats = currentRow.stats;
    if (!baselineStats || !currentStats) {
      incomparable.push({ baseline: baselineRow, current: currentRow });
      continue;
    }
    const medianDelta = relativeDelta(baselineStats.median, currentStats.median);
    const rowClass: RowClass = Math.abs(medianDelta) < THRESHOLD ? 'neutral' : medianDelta > 0 ? 'regression' : 'improvement';
    compared.push({
      baseline: baselineRow,
      current: currentRow,
      baselineStats,
      currentStats,
      medianDelta,
      sizeDelta:
        baselineRow.meanResponseBytes === null || currentRow.meanResponseBytes === null
          ? NaN
          : relativeDelta(baselineRow.meanResponseBytes, currentRow.meanResponseBytes),
      rowClass,
    });
  }
  // Most interesting rows first
  compared.sort((a, b) => Math.abs(b.medianDelta) - Math.abs(a.medianDelta));
  const added = [...currentRows.values()].filter(row => !baselineRows.has(row.key));
  const removed = [...baselineRows.values()].filter(row => !currentRows.has(row.key));
  const mismatches = fingerprintMismatches(baseline, current);

  /*
   * Led by the current run's timestamp, matching the run files' own
   * <timestamp>-<sha> convention: the shas alone are not unique, so diffing two
   * different pairs of runs built from one commit — a cold and a warm run of the
   * same checkout, say — used to produce the same name and overwrite the earlier
   * report. Locally that was a visible clobber; once reports are published to a
   * shared bucket it is a silent one.
   */
  const defaultName = `${fileTimestamp(current.fingerprint.timestamp)}-diff-${baseline.fingerprint.gitSha.slice(0, 7)}-vs-${current.fingerprint.gitSha.slice(0, 7)}.html`;
  const htmlPath = outputFile ?? path.join(path.dirname(path.resolve(currentFile)), defaultName);
  fs.writeFileSync(htmlPath, renderDiffHtml(baseline, current, compared, incomparable, added, removed, mismatches));

  const regressions = compared.filter(row => row.rowClass === 'regression');
  const improvements = compared.filter(row => row.rowClass === 'improvement');
  const newlyFailing = [...compared, ...incomparable].filter(row => row.baseline.ok && !row.current.ok);
  if (mismatches.length > 0) {
    console.warn(`⚠ Fingerprint mismatch (${mismatches.length} differences) — see report for details`);
  }
  console.log(
    `${compared.length} rows compared: ${regressions.length} regression(s), ${improvements.length} improvement(s), ` +
      `${newlyFailing.length} newly failing, ${incomparable.length} incomparable, ${added.length} added, ${removed.length} removed`,
  );
  for (const row of newlyFailing) {
    console.log(`  NEWLY FAILING  ${row.current.key}`);
  }
  for (const row of regressions) {
    console.log(`  REGRESSION ${formatDelta(row.medianDelta).padStart(8)}  ${row.current.key}`);
  }
  console.log(`HTML: ${htmlPath}`);
  const published = await publishPerfArtifacts([htmlPath]);
  if (!published && isPerfPublishRequired()) {
    console.error('✗ PERF_REQUIRE_PUBLISH=true and the diff report was not published — this comparison leaves no durable record.');
    process.exitCode = 1;
  }

  /*
   * Newly failing rows fail regardless of latency: a row that succeeded in the
   * baseline and errors now is a binary fact, not a measurement, so no
   * threshold applies to it. Latency regressions are judged against
   * FAIL_THRESHOLD rather than the report's THRESHOLD — see its comment.
   */
  if (FAIL_ON_REGRESSION) {
    const failing = regressions.filter(row => row.medianDelta >= FAIL_THRESHOLD);
    if (failing.length > 0 || newlyFailing.length > 0) {
      console.error(
        `\n✗ ${newlyFailing.length} newly failing row(s) and ${failing.length} regression(s) beyond ` +
          `${(FAIL_THRESHOLD * 100).toFixed(0)}% (PERF_DIFF_FAIL_THRESHOLD)`,
      );
      process.exitCode = 1;
    }
  }
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
