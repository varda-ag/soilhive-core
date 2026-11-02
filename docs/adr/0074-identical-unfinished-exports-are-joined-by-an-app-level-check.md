# Identical unfinished Exports are joined by an app-level check

An Export request identical to an unfinished one, from the same Subject under the same Export Limits, returns that Export (200) instead of enqueuing another (201). Identity is a hash of every request field, with `dataset_ids` and `formats` as sets, plus the Subject and admin flags. It is stored as `singletonKey` on the `standard` `export` queue, where pg-boss does not enforce it. `POST /jobs` takes a `pg_advisory_xact_lock` on the hash and looks up an unfinished job by `singleton_key`, as ADR 0042 does per Dataset. Anonymous Exports carry no key and never join: anyone may cancel one, so a stranger could cancel another's.

## Considered options

- **pg-boss `exclusive` policy**: rejected in favour of the ADR 0042 pattern. It also needs a migration, since `createQueue` never changes an existing queue's policy and `updateQueue` cannot.

## Consequences

- Runs (`data-requests`, `soil-indexes`) are never joined: their id is a bearer capability to read and destroy (ADR 0037).
- `file-to-db` can only be joined while queued, because a running staging has already read its mapping. Left for a separate change.
