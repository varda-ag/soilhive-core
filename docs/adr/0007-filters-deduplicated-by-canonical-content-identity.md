# Deduplicate data filters per owner by canonical content identity

The frontend POSTs `/data-filters` on every debounced filter change, so `data_filters` accumulates a new row per user interaction even when the submitted `DataFilterDTO` is identical to one already stored. We decided to make `createFilter` idempotent: an equivalent submission returns the existing Filter's ID instead of inserting a new row.

Identity is **canonical**, not byte-based: a Filter is identified by `(owner, filter_hash)` where the hash is computed app-side over the *sorted set* of its canonical UserGeometry IDs (geometries are inserted/deduplicated first — reversing the previous insert order — then hashed) plus normalized parameters. Normalization sorts and dedupes list criteria and drops empty/absent keys, but **preserves explicit nulls**: `min_depth: null` means "match layers with no recorded depth" and is a different Filter from one omitting `min_depth` (see `SoilDataStorage` scalar handling). Geometry UUIDs are stable identity inputs because `deleteUserGeometry` never removes a geometry referenced by a filter join row.

Dedup is enforced by a partial unique index on `(owner, filter_hash) WHERE deleted_at IS NULL` (NULL owners not distinct, so anonymous submissions dedupe among themselves), with `INSERT … ON CONFLICT … DO UPDATE SET updated_at = now()`. The `DO UPDATE` is deliberate and safe here — unlike `user_geometries`, where `DO NOTHING` is mandatory because the hash is derived from stored bytes — since `filter_hash` is computed from canonical inputs and cannot drift. Bumping `updated_at` gives it **last-used** semantics, so a future TTL cleanup of non-`persistent` filters can reap on `updated_at` without deleting a filter a client is actively re-requesting.

## Consequences

- `POST /data-filters` always returns 201 with the stored entity, whether inserted or reused; clients cannot (and need not) tell the difference.
- On a dedup hit the client receives the *first* submission's raw `filter` jsonb, which is canonically equivalent but not necessarily byte-identical to what it sent. This mirrors the documented UserGeometry contract; the raw jsonb must keep being stored because `useDownloadPreview`/`useDownloadSummary` read `filter.geometries` from it.
- `updated_at` on `data_filters` no longer means "last modified" — it means "last used". Do not "fix" the `DO UPDATE` back to `DO NOTHING`, or an eventual TTL cleanup will 404 active clients.

## Considered options

- **Raw DTO hash (generated column, like `geom_hash`)** — simplest, and would catch the frontend's literal repeat-POSTs, but geometry reordering, duplicate geometries, or equivalent-but-not-byte-equal geometries would still mint new rows, and it can't be a generated column anyway once identity depends on canonicalised geometries.
- **Global dedup (hash only, no owner)** — maximum dedup, but `owner` degrades to "first submitter": another user's identical filter would be missing from their `GET /data-filters` list and unsafe for future per-owner features (naming, deletion, quotas).
- **`ON CONFLICT DO NOTHING`** — append-only purity, but freezes timestamps at first submission, so an age-based cleanup would reap filters that are in active use.
