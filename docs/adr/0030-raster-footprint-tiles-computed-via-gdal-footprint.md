# ADR 0030: Raster footprint tiles are computed by `gdal_footprint`, not traced in JS

**Status:** Accepted

## Context

`streamRasterFootprints` (`backend/src/scripts/computeRasterFootprints.ts`) computes one footprint
geometry per cell of a grid tiling each raster band (`computeGrid`) — for spatial-index/query
performance and to bound per-step memory/CPU cost, not to represent the raster's true shape as one
geometry.

It originally traced each tile's valid/NoData boundary in JS (`geotiff` + a `Map`/`Set` graph walk),
running as a pg-boss worker in the same process and event loop as the API server. On a real
high-resolution raster (~12,500 avg vertices/footprint), this reliably failed the pod's 1-second
liveness/readiness probes. Memory, CPU throttling, and CPU starvation were all ruled out by direct
measurement; three escalating rounds of event-loop yielding didn't help either. That points at V8
stop-the-world GC pauses from the tracer's own allocation churn — a pause that preempts the JS thread
below any yield point, so no amount of cooperative yielding could fix it.

After the fix below shipped, a second failure surfaced: a 16-layer bulk `RASTER_LOAD` job completed but left the pod's memory baseline ~1GiB higher than before it ran. The
pod was then `OOMKilled` while running the *next* raster-load job on that same pod. RSS stayed flat throughout both jobs and
cgroup `cache` reset to ~0 after each — ruling out a JS/native leak and page cache — leaving kernel
memory (slab: dentry/inode caches) from this design's own volume of per-tile subprocess spawns and
temp-file churn as the cause. Confirmed by direct reproduction: a synthetic fork+tempfile-churn test
showed negligible growth, but the real pipeline against real rasters showed ~78MB/band that never
reset at band boundaries — extrapolating to ~1.26GB over 16 bands, matching production.

## Considered Options

- **Concurrency scheduling** — a plain sequential loop, then fixed-size `Promise.all` chunks, were
  both measured and rejected: neither raised effective throughput much, because the bottleneck was
  never scheduling, it was `libgdal`'s per-process dynamic-linking cost (~100-150ms uncontended,
  ~450-480ms contended) — confirmed by isolating it directly and ruling out driver registration
  (`GDAL_SKIP`) as a cause. A rolling-window pool (`FOOTPRINT_CONCURRENCY = 10`, `Map` +
  `Promise.race`) was chosen instead, since it extracts close to the full scheduling benefit that
  cost allows. `p-limit` — already a dependency, already used elsewhere in this codebase
  (`BulkLoader`) — was considered and rejected for this specific spot: that existing usage never
  submits more than ~10 tasks at once, while a rolling window over up to 54,300 tiles would mean
  building that many wrapped promises upfront instead of launching each one on demand; it would also
  scatter `handleResult`'s single-call-site state-mutation invariant across many `.then()` callbacks
  rather than one visible loop.
- **Eliminating per-tile GDAL process/file churn outright**, to fix the OOM at its root — batching
  several tiles into one long-lived process (via Python + GDAL's own bindings, or a disposable
  `gdal-async` child process) — was rejected: no new dependencies. GDAL's newer unified `gdal pipeline` CLI,
  which might have offered the same thing, isn't available in the installed GDAL version either.
- **Recovering per-tile spatial-index granularity** after making tiles larger — splitting each
  footprint in JS (e.g. via `@turf/turf`) before insert — was rejected: even
  cheap per-tile JS work risks the same GC-pause-duration problem this ADR exists to avoid, since it
  concentrates many small tiles' worth of work into fewer, larger bursts.

## Decision

Compute each tile's footprint with `gdal_footprint` (GDAL ≥ 3.8) instead of tracing pixels in JS:

- A once-per-band local overview extract is windowed per tile via a VRT, then traced and reprojected
  in one `gdal_footprint` call. Full-fidelity tracing (no simplification) costs nothing extra over
  GDAL's own default-simplified output — fixed process-spawn overhead dominates either way.
- `buildTileVrt` builds each tile's VRT in JS instead of via a second `gdal_translate` call, halving
  GDAL processes per tile. It substitutes only the four fields that vary per tile into a real,
  once-per-band GDAL-generated template — deliberately keeping the `<SRS>` block (including
  `dataAxisToSRSAxisMapping`, which genuinely differs by CRS) byte-for-byte from GDAL's own output
  rather than recomputed by hand, since getting that wrong would silently produce a wrong, not merely
  failing, footprint. Verified byte-identical to real GDAL output across CRS types and an edge-case
  window before relying on it. Net effect: ~16.5min for a near-global raster, down from ~1h40min,
  within ~2x of the original JS baseline (9min) — while keeping all tracing off the Node event loop
  and heap.
- For the OOM: `MAX_TILES` is divided by 16 (`MIN_TILES` untouched — small rasters were never the
  problem), directly cutting subprocess and temp-file volume per band for the large/global rasters
  that actually hit this.
- `insertFootprintBatch` runs `ST_Subdivide()` on each footprint before insert, recovering the
  small-geometry granularity `raster_footprints`' arbitrary-polygon `ST_Intersects` queries need. The
  vertex budget (`SUBDIVIDE_MAX_VERTICES`) comes from real
  per-footprint vertex figures (~10% of the total database to be migrated) — most footprints go unsplit
  either way; 1000 bounds the pathological tail to far fewer rows than 256 would, for comparable
  index-selectivity benefit.

Two predating, unaffected changes: `insertFootprintBatch` encodes footprints as WKB rather than
GeoJSON (`ST_GeomFromWKB` reads pre-encoded doubles directly, no JSON/decimal-text parsing), and
batches flush by accumulated vertex count (`MAX_BATCH_VERTICES = 200,000`) rather than a fixed
footprint count, since vertex count — not footprint count — is what determines a batch's actual
memory cost.

## Consequences

- All tracing/reprojection now runs in a GDAL subprocess, off the Node event loop and heap — expected
  to remove the GC-pause mechanism behind the original probe failures, though this is inferred, not
  confirmed against a real recurrence of that specific workload.
- Per-tile latency is now dominated by `libgdal`'s load cost, not the JS tracer's vertex-count-scaled
  cost; raising `FOOTPRINT_CONCURRENCY` further is bounded by the pod's actual CPU headroom, not by
  anything left in the design.
- The OOM fix is confirmed against the real workload: the same 16-layer job that produced +1GiB
  before now grows only ~200MiB (12h → 3h10min), with no runaway trend within the run; a separate
  4-layer, 30m-resolution, continental job — closer to the profile that first surfaced this issue —
  grew only ~10MiB in 10 minutes. Both fall short of the naive 16x `MAX_TILES` implies, which is
  expected (fixed per-band overhead doesn't shrink, and not every layer sat at the old ceiling).
- That residual (~200MiB, or ~10MiB) is real, not zero — it would still compound over enough
  consecutive jobs on a pod that never restarts (~9-10 jobs at the higher rate). A materially smaller
  risk than before, not a fully closed one.
- Overview extraction now always runs (previously conditional for local-storage rasters), and the
  `nodataF32` `Math.fround` workaround no longer applies, since GDAL's NoData handling is internally
  consistent by construction.
