# Aggregation Units are a Derived Filter, deliberately outside Filter content identity

Soil Statistics report one bucket per spatial Aggregation Unit, and when the units come from an uploaded file there is nowhere in the schema that says "these geometries belong to this file" — `user_geometries` has no owner and `data_filter_user_geometries` is the only junction. Rather than add a table, we insert each file geometry through the existing `insertUserGeometry` (so canonicalisation, `geom_hash` dedup and the subdivision trigger keep their single write path) and link them to a **Derived Filter** carrying a copy of the source Filter's criteria, so an Aggregation Unit is simply a UserGeometry of that Filter and the geometries are served by `GET /data-filters/{id}/geometries` for the file and no-file cases alike.

## Consequences

- A Derived Filter's `filter` jsonb holds **no geometries** (`geometries: []`) plus a `source_file_id` key. A 200-parcel geometry blob per row is not worth storing when the junction already holds them, but it means the stored raw form of a Derived Filter is *not* the DTO a client could have submitted.
- Because of that, its `filter_hash` is computed over `(geometryIds, parameters, source_file_id)` — **namespaced**, not the plain content identity of ADR 0007. This is load-bearing, not incidental: `computeFilterHash` reads the junction and the parameters, never the jsonb, so an un-namespaced Derived Filter would carry a *legitimate* hash and `POST /data-filters` from the same owner with the same geometries and criteria would hit `ON CONFLICT (owner, filter_hash) DO UPDATE` and hand the user back the Derived Filter — whose empty `geometries` is exactly what the frontend reads to draw the AOI. The polygon would silently vanish from the download map. A test asserts the two ids stay distinct; do not "simplify" the extra hash input away.
- Re-running the job on the same file with the same criteria is idempotent: the namespaced hash still deduplicates against *itself*, so no new Filter row accumulates.
- Derived Filters appear in `GET /data-filters` alongside a user's own. Nothing in the UI calls that endpoint today, and they are left `persistent = false` so a future age-based reaper can take them.
- Units are capped (see ADR 0021), which is also what keeps this table growth bounded: `user_geometries` has no TTL and no owner, so an uncapped job would dump unreclaimable rows into it.

## Considered options

- **A `file_user_geometries` junction table** — the clean model, and the only one that survives Filter deletion or records the source row of each unit; rejected to avoid a schema change.
- **`filter_hash = NULL` on Derived Filters** — the partial unique index makes collision impossible, but every job run then creates a new Filter row: correctness by giving up dedup entirely.
- **Reconstructing geometries into the `filter` jsonb on read** — keeps the jsonb honest, but makes `GET /data-filters/{id}` — which the frontend calls on every download page — return the full geometry set, and changes an existing endpoint.
