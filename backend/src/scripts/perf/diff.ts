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
 * paired by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, formatBytes, formatMs, PAGE_CSS, renderFingerprintHtml } from './report';
import { Fingerprint, LatencyStats, PERF_RUN_VERSION, PerfRun, ResultRow } from './types';

const THRESHOLD = Number(process.env['PERF_DIFF_THRESHOLD']) || 0.15;

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
const findLastTwoRuns = (): [string, string] => {
  const files = fs.existsSync(RESULTS_DIR)
    ? fs
        .readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
    : [];
  if (files.length < 2) {
    throw new Error(`Need at least two run files in ${RESULTS_DIR} to compare without arguments (found ${files.length})`);
  }
  const currentFile = path.join(RESULTS_DIR, files[files.length - 1]!);
  const pairingKey = pairingKeyOf(loadRun(currentFile).fingerprint);
  for (let i = files.length - 2; i >= 0; i--) {
    const candidateFile = path.join(RESULTS_DIR, files[i]!);
    try {
      if (pairingKeyOf(loadRun(candidateFile).fingerprint) === pairingKey) {
        return [candidateFile, currentFile];
      }
    } catch {
      // Unreadable or incompatible run file — not a candidate baseline
    }
  }
  throw new Error(
    `No earlier run matching "${pairingKey}" found in ${RESULTS_DIR} to compare ${path.basename(currentFile)} with — ` +
      'pass a baseline and a current file explicitly',
  );
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

const main = () => {
  const args = process.argv.slice(2);
  // eslint-disable-next-line prefer-const
  let [baselineFile, currentFile, outputFile] = args;
  if (args.length === 1 || args.length > 3) {
    console.error('Usage: npm run perf:diff [-- <baseline.json> <current.json> [output.html]]');
    process.exit(1);
  }
  if (!baselineFile || !currentFile) {
    [baselineFile, currentFile] = findLastTwoRuns();
    console.log(`Comparing the two most recent runs:\n  baseline: ${baselineFile}\n  current:  ${currentFile}`);
  }
  const baseline = loadRun(baselineFile);
  const current = loadRun(currentFile);

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

  const defaultName = `diff-${baseline.fingerprint.gitSha.slice(0, 7)}-vs-${current.fingerprint.gitSha.slice(0, 7)}.html`;
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
};

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
