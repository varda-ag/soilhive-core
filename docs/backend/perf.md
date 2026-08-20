# Performance suite

The performance suite measures the endpoints tagged `data-filters` in `openapi.yaml`, plus `GET /soil-data`. It exists to compare latency **across runs**, which is why almost everything about it is organised around making two runs comparable rather than around producing a single number.

There are two ways to run it:

- **Locally**, with `npm run perf` and `npm run perf:diff` — see the header comment in [`runner.ts`](../../backend/src/scripts/perf/runner.ts), which is the canonical description of what the suite measures and why.
- **On a schedule**, as the `soilhive-core-perf` container image. That is what this page is about.

---

## Modes: managed and attached

One knob, `PERF_BASE_URL`, decides which system a run measures. Everything else follows from it.

| | **Managed** (`PERF_BASE_URL` unset) | **Attached** (`PERF_BASE_URL` set) |
|---|---|---|
| What is measured | An API the suite spawns itself (`dist/app.js`) on localhost | An already-deployed API |
| Server lifecycle | Started and stopped by the suite | Not managed; `GET /ready` must already succeed |
| Cache state | Cold — a fresh process, every row measures real work | Warm and shared, unless `PERF_CACHE_BYPASS=true` |
| Database | **Required.** Row counts are read directly for the fingerprint | Not touched at all |
| Fingerprint strength | Strongest: DB row counts *and* the `GET /datasets` fingerprint | `GET /datasets` fingerprint only (ADR 0024) |
| Measures | A single fresh process against the real database | The deployed topology as a client experiences it |

The image supports both. A schedule that only ever measures a deployed target should **not** be given database credentials — it does not need them, and managed mode is the only thing that would use them.

---

## The image

`ghcr.io/varda-ag/soilhive-core-perf`, built by `docker-build.yaml` on the same triggers as the backend and frontend images.

Its entrypoint is a measurement **followed by a comparison**:

```sh
node dist/scripts/perf/runner.js     # measure, write + publish the run
node dist/scripts/perf/diff.js --after-run   # compare against the newest eligible earlier run
```

Both always run: the diff is skipped only if the container dies, never because the run failed — a run with failed rows is precisely what produces the diff's *newly failing* rows.

Two things about the image are easy to trip over:

- **`npm run perf` and `npm run perf:diff` do not work inside it.** The first runs `npm run build` first, and the image has no `tsc` (dependencies are installed with `--omit=dev`); the second runs `ts-node`, also absent. The entrypoint invokes the compiled `dist` output directly, so changes to those npm scripts do not reach the container.
- **Its build context is `backend`, not the directory its Dockerfile lives in.** The Dockerfile sits at `backend/src/scripts/perf/Dockerfile`, beside the code it packages, but a context containing only that directory could not reach `package.json`, `tsconfig.json` or `tests/assets/geojson`. See ADR 0029.

### What the image sets, and what you must

The image bakes only what is true of it regardless of schedule. Everything that decides *what a run measures* — and whether a regression should alarm — comes from the schedule, so the CronJob spec is the single readable answer to what a run does.

| Baked into the image | Why |
|---|---|
| `PERF_GIT_SHA`, `PERF_GIT_BRANCH` | From build args; there is no `.git` in the image |
| `PERF_REQUIRE_PUBLISH=true` | The container's disk is ephemeral, so the upload is the run's only durable record |
| `PERF_SERVER_NODE_OPTIONS` | Holds the *measured* server at production's 256 MB heap |
| `NODE_OPTIONS` | Gives the *measuring* process more room than the app it measures |

---

## Environment reference

### Choosing the target

| Variable | Default | Meaning |
|---|---|---|
| `PERF_BASE_URL` | unset | API root to measure, e.g. `https://qa.example.com/api/v1`. Unset = managed mode |
| `PERF_CACHE_BYPASS` | `false` | Send the cache-bypass header on every request, so the target answers nothing from its query cache. **Against a shared environment this is a load-generating run** — its database performs the full work of every iteration |
| `PERF_CACHE_BYPASS_SECRET` | unset | Must match `CACHE_BYPASS_SECRET` on the target, which ignores the header without one. Supply as a **secret reference**, never a literal (see ADR 0029) |

### Choosing the work

| Variable | Default | Meaning |
|---|---|---|
| `PERF_ASSETS` | all | Comma-separated asset names without the extension, e.g. `France,Italy`. An unknown name aborts the run |
| `PERF_ENDPOINT` | full suite | Restrict phase 2 to one of `coverage`, `datasets`, `soil-data`, `dai`. Phase 1 (`POST /data-filters`) always runs, since every phase-2 row consumes its filter ids |
| `PERF_ITERATIONS` | `1` | Timed requests per row. **A schedule that alarms on regressions wants more than 1** — a one-sample "median" is not a median |
| `PERF_DAI_RESOLUTIONS` | `3,5,7` | DAI resolutions to measure |
| `PERF_WARMUP` | `false` | One untimed request per row. Pointless in attached mode and rejected outright with the cache bypass |
| `PERF_TIMEOUT_MS` | `120000` | Per-request timeout |
| `PERF_SERVER_TIMEOUT_MS` | `60000` | How long managed mode waits for its server to become ready |

### Comparing

| Variable | Default | Meaning |
|---|---|---|
| `PERF_DIFF_THRESHOLD` | `0.15` | Relative median change at which a row is **coloured** as a regression/improvement in the report |
| `PERF_DIFF_FAIL_ON_REGRESSION` | `false` | Whether the diff **exits non-zero** on regressions |
| `PERF_DIFF_FAIL_THRESHOLD` | `0.3` | Relative median change at which a regression fails the job. Separate from `PERF_DIFF_THRESHOLD` on purpose: raising one knob to stop a noisy schedule flapping would also stop the report highlighting what it exists to show |
| `PERF_DIFF_LOOKBACK` | `25` | How many published runs to look back through for an eligible baseline |

### Storage and provenance

| Variable | Required | Meaning |
|---|---|---|
| `STORAGE_MODE` | yes, `s3` | Anything else and the image aborts before measuring, because `PERF_REQUIRE_PUBLISH=true` |
| `S3_STORAGE_BUCKET`, `S3_STORAGE_REGION`, `S3_STORAGE_ROOT_FOLDER` | yes | Standard app storage configuration. Artifacts are written under the bucket-root `perf-results/` prefix, deliberately outside `S3_STORAGE_ROOT_FOLDER` |
| `POSTGRES_*` | managed mode only | `HOST`, `PORT`, `DB`, `USER`, `SCHEMA`, plus either `POSTGRES_PASSWORD` or `POSTGRES_AWS_REGION` with an IAM role |

---

## What a scheduled run produces

Both a `.json` and an `.html` file per run, plus an `.html` diff report, all under `s3://$S3_STORAGE_BUCKET/perf-results/`. The JSON is what `perf:diff` consumes; the HTML is for reading.

The baseline for the comparison comes **from the bucket**, not from disk: a container's local directory holds only the run it just wrote. The diff walks the published runs newest-first and takes the first one that measured *the same target the same way* — same `PERF_BASE_URL`, same cache mode. A run against QA is never compared against a localhost run, and a cache-bypassed run is never compared against a warm one.

### Exit codes

| Situation | Exit | Note |
|---|---|---|
| Clean run, no regressions | 0 | |
| Some rows failed (`502`, timeout, …) | non-zero | Both result files are still written and published first |
| Regressions beyond the fail threshold | non-zero | Only when `PERF_DIFF_FAIL_ON_REGRESSION=true` |
| **No eligible baseline** | **0** | Not an error: this is what a first run looks like, and equally the first run after changing `PERF_BASE_URL`, flipping `PERF_CACHE_BYPASS`, or bumping `PERF_RUN_VERSION` |
| Results could not be published | non-zero | The run left no durable record, so it did not achieve anything |
| The results bucket could not be read | non-zero | Deliberately distinct from "no baseline" — a revoked permission must not pass for a fresh start |

Set **`backoffLimit: 0`**. A retry is another full run against the same target, and under `PERF_CACHE_BYPASS` a deliberately load-generating one.

---

## A worked schedule

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: soilhive-perf-qa
spec:
  schedule: "0 3 * * *"
  # A perf run must never overlap itself: two concurrent runs measure each
  # other's load.
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      # A retry would be a second full run against the same target.
      backoffLimit: 0
      # Bound the run explicitly: the full suite is ~190 rows, each up to
      # PERF_ITERATIONS requests with a 120s timeout.
      activeDeadlineSeconds: 5400
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: perf
              image: ghcr.io/varda-ag/soilhive-core-perf:<tag>
              env:
                # Attached mode: measure the deployed API, touch no database.
                - name: PERF_BASE_URL
                  value: https://qa.example.com/api/v1
                - name: PERF_ASSETS
                  value: France,Italy,Kenya,USA
                - name: PERF_ITERATIONS
                  value: "5"
                - name: PERF_CACHE_BYPASS
                  value: "true"
                - name: PERF_DIFF_FAIL_ON_REGRESSION
                  value: "true"
                - name: PERF_DIFF_FAIL_THRESHOLD
                  value: "0.30"
                - name: STORAGE_MODE
                  value: s3
                - name: S3_STORAGE_BUCKET
                  value: soilhive-qa
                - name: S3_STORAGE_REGION
                  value: eu-west-1
                - name: S3_STORAGE_ROOT_FOLDER
                  value: data
                # Never a literal: the shell/.env split that used to keep this
                # out of shell history does not exist in a container, so a
                # secret reference is what replaces it (ADR 0029).
                - name: PERF_CACHE_BYPASS_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: soilhive-perf
                      key: cache-bypass-secret
```

### Sizing the run

The full suite is 20 geojson assets plus 4 `params` sidecars = **24 asset/variant combinations**, each producing about 8 phase-2 rows (`GET` by id, coverage, datasets, soil-data, and one DAI row per resolution) — roughly **190 measured rows**, each `PERF_ITERATIONS` requests with a 120 s per-request timeout. An unset `PERF_ASSETS` means all of it.

Nothing in the image bounds that. Use `PERF_ASSETS` and `PERF_ENDPOINT` to scope the run and `activeDeadlineSeconds` to bound it.

### The side effect

**The suite is not read-only.** Phase 1 persists one data filter per asset/variant in the target's database — one, not one per iteration, because filters are deduplicated by canonical content identity (ADR 0007). Creating one still canonicalises geometries, persists user geometries and drives subdivision precomputation. Without the cache bypass, the run also warms caches other clients of that environment share.

This is documented rather than gated: a confirmation prompt would make the suite unusable from a schedule, and a host allowlist would bake environment names into the repo.

---

## Related decisions

- [ADR 0024](../adr/0024-remote-perf-runs-fingerprint-data-via-the-api.md) — why an attached run's fingerprint comes from `GET /datasets`, and why comparability is target-scoped
- [ADR 0028](../adr/0028-cache-bypass-is-a-per-request-secret-header.md) — the cache-bypass header, and why a bypassed run only ever pairs with another bypassed run
- [ADR 0029](../adr/0029-perf-suite-ships-as-a-scheduled-third-image.md) — the image, and the four local-run assumptions a container invalidates
- [ADR 0007](../adr/0007-filters-deduplicated-by-canonical-content-identity.md) — why repeat runs reuse one filter
- [ADR 0008](../adr/0008-query-cache-via-typeorm-with-custom-in-memory-provider.md) — the query cache the bypass exists to defeat
