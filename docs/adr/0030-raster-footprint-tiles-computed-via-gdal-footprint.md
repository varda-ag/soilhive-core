# ADR 0030: Raster footprint tiles are computed by `gdal_footprint`, not traced in JS

**Status:** Accepted

## Context

`streamRasterFootprints` (`backend/src/scripts/computeRasterFootprints.ts`) computes, per band, one
footprint geometry per cell of a grid tiling the raster (`computeGrid`, sized so each tile stays
near a target pixel count) — the tiling exists for spatial-index/query performance, and to keep the
memory and CPU cost of any one step bounded, not to represent the raster's true coverage shape as a
single geometry.

It originally did this by reading each tile's pixels through the `geotiff` npm package, tracing the
valid/NoData boundary in JS with a `Map`/`Set`-based graph walk (`traceMaskToPolygons`), collapsing
collinear points, and — for non-WGS84 rasters — reprojecting accumulated batches through
`gdaltransform`. This ran as a pg-boss worker in the same process, and the same event loop, as the
HTTP API server.

Processing a real high-resolution raster (30m native resolution, a complex enough valid-data mask to
average around 12,500 vertices per traced footprint) reliably failed the pod's liveness and readiness
probes — `Liveness probe failed: ... context deadline exceeded` — and the container was restarted.
Kubernetes' default 1-second probe `timeoutSeconds` (neither probe overrode it) left almost no margin
against the tracer's own cost, and a `/health` handler that does nothing but `res.json(...)` was still
missing that window.

Ruled out by direct measurement, roughly in this order, before this decision: pod memory usage (well
under the container limit), CFS quota CPU throttling (no CPU limit was set), and CPU share starvation
under node contention (the node had idle cores available at the moment of failure). Three
rounds of progressively more aggressive in-process event-loop yielding were then tried — `setImmediate`
every 25 tiles, then every tile, then chunking the batch-flush's collinear-collapse work too — none of
which changed the outcome. That points at V8 garbage-collection pauses driven by the tracer's own
allocation churn (a `Map`, a `Set` and nested coordinate arrays per tile, becoming garbage almost
immediately) as the remaining likely cause: a stop-the-world GC cycle preempts the JS thread below the
level any in-process `await`/`setImmediate` yield point can reach, so no amount of cooperative
yielding inside the tracer could have fixed it.

## Decision

Compute each tile's footprint with `gdal_footprint` (GDAL ≥ 3.8) instead of tracing pixels in JS:

- A once-per-band local extract of the selected overview is still made (as it already was for
  S3-hosted rasters) — but now unconditionally, since a VRT window addresses pixels of the file it
  points to directly, with no way to select "overview level N" of a multi-resolution source.
- Per tile, `gdal_translate -of VRT -srcwin <pxStart> <pyStart> <w> <h>` windows that tile out of the
  overview extract — a small XML reference, not a pixel copy.
- `gdal_footprint -b 1 -max_points unlimited -t_srs EPSG:4326 -of GeoJSON -q` then traces,
  simplifies (or rather, does not — see below) and reprojects that window in one native call,
  returned via `/vsistdout/` rather than a second temp file.
- `-max_points unlimited` overrides GDAL's own default (100), which auto-simplifies to fit that
  point budget. Measured directly against tiles with 0, ~1,800, ~4,800 and ~27,000 vertices: all took
  ~0.12-0.15s, dominated by fixed process-spawn overhead rather than tracing complexity — so full
  fidelity, matching what the JS tracer produced, costs nothing extra here.
- Overview selection now reads `gdalinfo -json`'s own `bands[].overviews[].size` rather than opening
  the file with `geotiff`, removing that dependency (and the file-handle lifecycle it needed) from
  this file entirely.
- Tiles are processed with bounded concurrency (`FOOTPRINT_CONCURRENCY`, 10), via a rolling-window
  worker pool (plain `Map` + `Promise.race`: a tile's replacement is launched the instant it
  finishes) rather than one at a time. This went through two earlier designs before landing here.
  First, a plain sequential loop, on the reasoning that raising concurrency safely needed the
  vertex-count batching separated from the per-tile compute step first, and that separation was real
  work not worth doing speculatively. That held until measured against real ingestion times: the
  same near-global raster took 9 minutes to ingest under the prior JS implementation but was
  estimated at ~3.8-4.5 hours sequentially under this one (54,300 tiles × ~0.25-0.3s), and with 64%
  of this deployment's rasters global and 25% continental, that's not an edge case — it's most
  ingestions. A raster-load job going from minutes to hours also directly hurts the `RASTER_LOAD`
  queue's own throughput, since it runs at `localConcurrency: 1` per node specifically because raster
  ingest is heavy — one job taking hours blocks every other raster queued behind it on that node.
  That regression was large enough to do the batching separation immediately: `computeTileFootprint`
  is pure and side-effect-free (touches only its own tile's VRT file, cleaned up before returning);
  `batch`/`batchVertexCount`/`tilesProcessed`/the timing accumulators are mutated only inside
  `handleResult`, which is only ever called from one linear point of control — that split is what
  makes any concurrency safe, regardless of how it's scheduled. Second, fixed-size chunks run via
  `Promise.all` (`FOOTPRINT_CONCURRENCY` tiles launched together, awaited together, next batch
  launched only once the whole chunk had settled) — chosen at the time because tile cost looked
  fairly uniform (the `-max_points unlimited` measurement above), so a chunk boundary seemed unlikely
  to wait long on a straggler. Measured against the same near-global raster, that design produced
  ~1h40min at `FOOTPRINT_CONCURRENCY = 10` — far short of the naive ~10x speedup a fixed floor of
  concurrency implies. Two compounding causes, not one: process fork/exec and GDAL's driver-registry
  initialization are real CPU work, not idle wait, so 10 concurrent subprocesses are bounded by
  however many cores this pod can actually get scheduled onto at once, which depends on its CPU
  request/limit configuration and the node's own contention; and fixed-size chunking has its own tax
  independent of core count,
  since every chunk has to fully drain — including its slowest straggler under real contention, which
  is worse than the uncontended measurement suggested — before the next chunk's tiles are even
  submitted, repeated across 54,300 ÷ 10 ≈ 5,430 chunk boundaries. The rolling window removes the
  second cause entirely.
- That re-measurement is what settled which of the two causes actually mattered: the rolling window
  produced no measurable improvement over fixed-size chunking (~5-6min per 2,715-tile progress
  interval either way, on the same near-global raster) — ruling out the chunk-drain tax as
  significant and pointing squarely at per-call CPU cost. A real log line from that run made this
  precise: cumulative `vrtMs + footprintMs` (2,520,677ms) against wall-clock `elapsedMs` (255,216ms)
  for the same 2,715 tiles gives ≈9.88x — essentially the full `FOOTPRINT_CONCURRENCY = 10` benefit
  at the scheduling level. But each individual subprocess call ran 3-4x slower than the same call
  measured uncontended (~450-480ms/call against ~100-150ms), so raising concurrency further couldn't
  have helped: 10 CPU-heavy subprocesses contending for however many cores this pod can actually get
  scheduled onto each just run slower, not more of them in parallel. `GDAL_SKIP` (skips registering named drivers) was tested as a way to cut that
  per-call cost — confirmed to actually take effect (only 3 of 153 drivers remained registered) — and
  made no measurable difference, ruling out driver *registration* as the cost. Directly isolated
  instead: bare `fork`/`exec` (`/usr/bin/true`) is ~0ms, while `gdalinfo --version` (loads `libgdal`,
  does nothing else) is consistently ~0.10-0.11s. The entire per-invocation cost is dynamically
  linking the shared library itself (`libgdal` and its dependencies — PROJ, SQLite), which is paid in
  full by any new process that links against it, `GDAL_SKIP` or no. The only way to avoid it
  entirely is not starting a new process per tile — which this codebase deliberately moved away from
  once already (`8d289341`, removing the `gdal-async` native addon), specifically because a native
  addon's GDAL errors could segfault the whole Node process rather than fail one subprocess call.
  Given that history, reviving an in-process GDAL binding to chase this cost was ruled out as a
  throughput-vs-stability tradeoff not worth making unilaterally for one job's speed.
- What was implemented instead: **halve the number of GDAL processes per tile**, from two
  (`gdal_translate -of VRT` then `gdal_footprint`) to one, by generating each tile's VRT in JS rather
  than via a subprocess. `buildTileVrt` takes a single whole-file reference VRT — generated once per
  band via one real `gdal_translate -of VRT` call with no `-srcwin` — and substitutes only the four
  fields that vary per tile (dataset size, the `GeoTransform`'s origin, `SrcRect`/`DstRect`) into a
  text copy of it. Everything else is carried over byte-for-byte from GDAL's own output, deliberately
  including the `<SRS>` block: GDAL derives its `dataAxisToSRSAxisMapping` attribute from the WKT's
  own axis convention, and that value genuinely differs by CRS (confirmed directly — `"2,1"`, a swap,
  for a geographic WGS84 raster; `"1,2"`, no swap, for a projected Lambert Azimuthal Equal Area one)
  — not something to recompute by hand for arbitrary input CRS without real risk of silently
  producing a wrong (not merely failing) footprint. Verified before relying on it, not after: for
  both of those CRS cases, and a near-edge window likely to hit a fragmented boundary, the resulting
  `gdal_footprint` GeoJSON output was byte-identical to running a real `gdal_translate -srcwin` for
  the same window. Measured afterward against three real files (255, 5,451 and — partially — 54,300
  tiles): VRT generation dropped to ~1.5-1.9ms/tile across all three (versus ~450-480ms/call
  contended, ~100-150ms uncontended, for the subprocess it replaced), and cumulative-time-vs-wall-
  clock continued to show ~9.83-9.88x achieved concurrency on all three — consistent with the earlier
  finding that the rolling window itself was never the problem. Net effect on the near-global raster:
  an extrapolated ~16.5min full run, down from the ~1h40min fixed-chunking measurement — roughly 6x,
  and within about 2x of the original JS implementation's 9 minutes, while keeping all tracing and
  reprojection work out of the Node process's event loop and heap.

Two more changes predate the `gdal_footprint` switch and are unaffected by it — both from an earlier
effort to bound memory during large raster loads, before the GC-pause diagnosis above pointed at the
tracer itself as the probe-failure cause:

- `insertFootprintBatch` (`RasterIngestService.ts`) encodes each footprint as WKB (`multiPolygonToWkb`,
  `backend/src/utils/wkb.ts`) rather than `JSON.stringify`, and inserts via `ST_GeomFromWKB` rather
  than `ST_GeomFromGeoJSON`. It was already in place to keep the per-batch insert cheap regardless of
  which stage produced the footprints, and `gdal_footprint`'s GeoJSON output feeds the same
  WKB-encode-then-insert path `traceMaskToPolygons`'s output did. The reasoning holds either way:
  `ST_GeomFromGeoJSON` has to parse a JSON text tree and re-parse every coordinate from decimal text,
  while `ST_GeomFromWKB` reads pre-encoded IEEE-754 doubles off a binary buffer directly, and the WKB
  payload itself is smaller (no repeated JSON keys, no decimal-text overhead per coordinate).
- Batches are flushed once accumulated vertex count crosses `MAX_BATCH_VERTICES` (200,000), rather
  than once a fixed footprint count is reached. A footprint's vertex count depends on how fragmented
  the valid-data mask is within its tile, not on raster shape or a fixed per-batch quota, so a fixed
  footprint-count threshold (the original `INSERT_BATCH_SIZE = 100`) bounds nothing about a batch's
  actual memory cost — 100 simple footprints and 100 highly fragmented ones (~12,500 average vertices
  each, on the real high-resolution raster measured above) differ in payload size by orders of
  magnitude. 200,000 keeps one batch's WKB payload in the low tens of MB (16 bytes per vertex: two
  float64s), comfortable even under a constrained heap. `MAX_BATCH_FOOTPRINTS` (500) is a backstop
  for the opposite degenerate case: many simple, low-vertex footprints trickling through the vertex
  budget almost one at a time, which would otherwise let footprint count — and the per-footprint
  overhead that comes with it — grow unbounded while staying comfortably under the vertex ceiling.

Unchanged: the tiled grid itself.

## Consequences

- All tracing, simplification and reprojection now happens in a GDAL subprocess, sharing this
  process's memory limit but none of its event loop or V8 heap. The `Map`/`Set`-based tracer, the
  collinear-collapse pass and the per-batch `gdaltransform` reprojection are gone from this file
  along with the churn they produced. This is expected to remove the GC-pause mechanism suspected of
  causing the probe failures — inferred, not directly proven, since nothing before this change
  isolated GC pauses specifically; confirming this against the real failing workload is the natural
  next check.
- Per-tile latency is now dominated by `libgdal`'s dynamic-linking cost (~100-150ms uncontended,
  ~450-480ms under real 10-way contention) rather than by the JS tracer's cost, which scaled with
  vertex count. Scheduling strategy alone couldn't fix this — fixed-size chunking measured ~2.4x at
  `FOOTPRINT_CONCURRENCY = 10` (1h40min against an estimated ~4hr sequential), and switching to a
  rolling window produced no further improvement, because both were already extracting ~9.8-9.9x of
  the theoretical 10x scheduling benefit; the shortfall was always the per-call cost, not how the
  calls were scheduled. Halving GDAL processes per tile (VRT generation moved into JS) is what
  actually closed most of the gap: an extrapolated ~16.5min for the same near-global raster, ~6x
  better than the fixed-chunking measurement and within ~2x of the original JS implementation's 9
  minutes. Raising `FOOTPRINT_CONCURRENCY` further is bounded by the raster-load pod's actual CPU
  headroom, not by anything left in the batching, scheduling, or per-tile-process design.
- The overview extraction step now always runs, including for local-storage-mode rasters that
  previously read the original file's embedded overview IFD directly via `geotiff`. That trades a
  one-time extraction cost (already paid for S3-hosted rasters) for not needing per-resolution-level
  addressing on the JS side at all.
- The `nodataF32` workaround (rounding `gdalinfo`'s reported NoData value through `Math.fround`
  before comparing against Float32 pixel data, because the JSON round-trip lost precision the raw
  pixel data never did) no longer applies: GDAL's own NoData handling is internally consistent by
  construction, since the same process reads back what it wrote.
