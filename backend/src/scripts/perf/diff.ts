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
 * Without arguments, the two most recent runs in perf-results are compared.
 */
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml, formatBytes, formatMs, PAGE_CSS, renderFingerprintHtml } from './report';
import { LatencyStats, PERF_RUN_VERSION, PerfRun, ResultRow } from './types';

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

/** Run files are named <ISO-timestamp>-<sha>.json, so a lexicographic sort is chronological. */
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
  const [baseline, current] = files.slice(-2);
  return [path.join(RESULTS_DIR, baseline!), path.join(RESULTS_DIR, current!)];
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

const fingerprintMismatches = (a: PerfRun, b: PerfRun): string[] => {
  const mismatches: string[] = [];
  const fpA = a.fingerprint;
  const fpB = b.fingerprint;
  if (fpA.iterations !== fpB.iterations) {
    mismatches.push(`iterations: ${fpA.iterations} vs ${fpB.iterations}`);
  }
  if (fpA.daiResolutions.join(',') !== fpB.daiResolutions.join(',')) {
    mismatches.push(`DAI resolutions: [${fpA.daiResolutions}] vs [${fpB.daiResolutions}]`);
  }
  if (fpA.nodeVersion !== fpB.nodeVersion) {
    mismatches.push(`node version: ${fpA.nodeVersion} vs ${fpB.nodeVersion}`);
  }
  const tables = new Set([...Object.keys(fpA.db), ...Object.keys(fpB.db)]);
  for (const table of tables) {
    if (fpA.db[table] !== fpB.db[table]) {
      mismatches.push(`DB ${table} count: ${fpA.db[table] ?? 'n/a'} vs ${fpB.db[table] ?? 'n/a'}`);
    }
  }
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
