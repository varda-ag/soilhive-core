import { Fingerprint, PerfRun, ResultRow } from './types';

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const formatMs = (ms: number): string => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(1));

export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
};

export const PAGE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; color: #1f2430; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { border: 1px solid #d8dce5; padding: 0.35rem 0.6rem; text-align: left; }
  th { background: #f0f2f7; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.regression { background: #fdecea; }
  tr.improvement { background: #e8f5e9; }
  tr.failed { background: #fdecea; }
  tr.added { background: #fff8e1; }
  tr.removed { background: #f3e5f5; }
  .banner { background: #fdecea; border: 1px solid #e57373; border-radius: 4px; padding: 0.8rem 1rem; margin: 1rem 0; }
  .meta { font-size: 0.85rem; }
  .meta dt { font-weight: 600; float: left; clear: left; width: 12rem; }
  .meta dd { margin-left: 13rem; }
  code { background: #f0f2f7; padding: 0.1rem 0.3rem; border-radius: 3px; }
`;

export const renderFingerprintHtml = (fp: Fingerprint): string => {
  const assets = fp.assets
    .map(a => {
      const variants = a.paramsVariants.map(v => `${v.variant} (${v.sha256.slice(0, 8)})`).join(', ');
      return `${escapeHtml(a.name)} — ${formatBytes(a.sizeBytes)}, sha ${a.sha256.slice(0, 8)}, params: ${escapeHtml(variants)}`;
    })
    .join('<br>');
  const db = Object.entries(fp.db)
    .map(([table, count]) => `${escapeHtml(table)}: ${count}`)
    .join(', ');
  return `
  <dl class="meta">
    <dt>Timestamp</dt><dd>${escapeHtml(fp.timestamp)}</dd>
    <dt>Git</dt><dd><code>${escapeHtml(fp.gitSha.slice(0, 10))}</code> on ${escapeHtml(fp.gitBranch)}${fp.gitDirty ? ' (dirty working tree)' : ''}</dd>
    <dt>Node</dt><dd>${escapeHtml(fp.nodeVersion)}</dd>
    <dt>Iterations per row</dt><dd>${fp.iterations} (after 1 warmup)</dd>
    <dt>DAI resolutions</dt><dd>${fp.daiResolutions.join(', ')}</dd>
    <dt>Endpoint selection</dt><dd>${escapeHtml(fp.endpoint ?? 'full suite')}</dd>
    <dt>DB row counts</dt><dd>${db}</dd>
    <dt>Assets</dt><dd>${assets}</dd>
  </dl>`;
};

const resultRowHtml = (row: ResultRow): string => {
  const statuses = row.statusCodes.length === 0 ? 'skipped' : [...new Set(row.statusCodes)].join(', ');
  const firstError = row.errors[0];
  const cells = [
    `<td><code>${escapeHtml(`${row.method} ${row.pathTemplate}`)}</code>${firstError ? `<br><small>${escapeHtml(firstError.slice(0, 300))}</small>` : ''}</td>`,
    `<td>${escapeHtml(row.asset)}</td>`,
    `<td>${escapeHtml(row.paramsVariant)}</td>`,
    `<td class="num">${row.daiResolution ?? ''}</td>`,
    `<td>${row.filterId ? `<code>${escapeHtml(row.filterId)}</code>` : '—'}</td>`,
    `<td class="num">${escapeHtml(statuses)}</td>`,
    `<td class="num">${row.stats ? formatMs(row.stats.min) : '—'}</td>`,
    `<td class="num">${row.stats ? formatMs(row.stats.median) : '—'}</td>`,
    `<td class="num">${row.stats ? formatMs(row.stats.mean) : '—'}</td>`,
    `<td class="num">${row.stats ? formatMs(row.stats.p95) : '—'}</td>`,
    `<td class="num">${row.stats ? formatMs(row.stats.max) : '—'}</td>`,
    `<td class="num">${row.meanResponseBytes === null ? '—' : formatBytes(row.meanResponseBytes)}</td>`,
  ];
  return `<tr${row.ok ? '' : ' class="failed"'}>${cells.join('')}</tr>`;
};

export const renderRunHtml = (run: PerfRun): string => {
  const rows = run.results.map(resultRowHtml).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Performance run ${escapeHtml(run.fingerprint.gitSha.slice(0, 10))}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<h1>Data-filters performance run</h1>
${renderFingerprintHtml(run.fingerprint)}
<h2>Results (${run.results.length} rows, ${run.totals.requests} timed requests, ${(run.totals.wallClockMs / 1000).toFixed(1)}s wall clock)</h2>
<table>
<thead>
<tr><th>Endpoint</th><th>Asset</th><th>Params</th><th>Res</th><th>Filter</th><th>Status</th><th>Min ms</th><th>Median ms</th><th>Mean ms</th><th>P95 ms</th><th>Max ms</th><th>~Size</th></tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
};
