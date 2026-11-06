# Data added to a published Dataset goes through a Dataset Version

**Status:** Accepted

Data is no longer loaded into a PUBLISHED Dataset. An admin opens a **Dataset Version** of it (v2): a Dataset row of its own, with `version_of` pointing at the published Dataset (v1), private and never PUBLISHED, so every public read already leaves it out. v2 goes through the usual ingestion steps with today's loaders and write path, and the admin reviews it like any unpublished Dataset. Publishing it is a `version-publish` job that, in one transaction, moves v2's rows into v1, applies the publication settings, increments v1's `version_number` and deletes v2. v1 keeps its id, slug and grants throughout, and its readers see its old data until the transaction commits.

Loading into a published Dataset used to hide it for the length of the load. A crashed worker left it hidden, a retry brought it back LOADED rather than PUBLISHED, and a failed load removed the layers of every File it had started on, published ones included. A version keeps the published Dataset out of the load entirely: whatever happens to v2, v1 serves what it served before, and nothing goes live until an admin publishes.

The publish moves v2's rows rather than copying them. A v2 Dataset Layer that v1 already has, on (feature, layer, soil property), is a collision: its Observations are added to v1's, an identical one dropped as a load drops it, and the v2 row is deleted. Every other Dataset Layer, Raster Layer and Dataset File Mapping is re-pointed to v1. The result is row for row what loading v2's Files into v1 would have given. Raster Layer groups are keyed by their layers' ids, not by Dataset (ADR 0046), so footprint links and groups survive the re-point untouched.

## Considered options

- **Keep loading into the published Dataset, hidden while it loads** (rejected). The behaviour this replaces: published data disappears for every load, and a crash or a failure leaves it hidden, demoted or missing layers.
- **A Load Buffer: stage each load's records in buffer tables, then Merge them into the published Dataset at the end of the load** (rejected). It needs a second write path beside `rawRecordToDataModel` that has to reproduce its deduplication exactly, a separate buffer design for raster, and either an automatic Merge (no review before data goes live) or buffers kept across sessions, which is a version under another name. A version reuses every existing step, route and loader by slug.
- **Copy v2's rows into v1 at publish** (rejected). Doubles the writes of a publish and still needs the collision handling. Re-pointing moves the rows and copies only the colliding Observations.
- **Keep published versions as archived copies, with rollback** (rejected for now). No one asked for it, and it would keep every increment's rows twice.

## Consequences

- **One open version per Dataset**, enforced by a partial unique index on `version_of`. A CHECK constraint keeps a version off PUBLISHED, and its name and descriptive metadata are v1's and read-only (409).
- **Loads into a PUBLISHED Dataset are refused** (409). The one exception is a Raster Load with no File to ingest, which only removes the layers of removed Files and leaves the Dataset PUBLISHED.
- **A version's loads keep their uploads** (`delete_source_files` is refused on them), because a reset loads its Files again. The publish request takes the flag instead.
- **Vector data is corrected per version, not per File.** Observations don't record their source File, so a wrong vector File in v2 is removed after a `version-reset`, which deletes all of v2's loaded data and puts its Files back to PENDING. A raster File can still be removed on its own.
- **Discarding a version works like a bulk delete.** The request soft-deletes v2, so it leaves the admin list and a new version can be opened at once, and `version-discard` removes its data in the background. A failed discard puts v2 back when it can, and the orphan sweep queues it again when it can't.
- **A version's slug is never reused.** Its slug history stays after a publish or a discard, so a grant, error, job or link keyed by the old slug can't attach to a later version, which gets a suffixed slug.
- **Features and Layers left unreferenced** by a reset, a discard or a bulk delete are removed by `sweep-orphan-rows`, which a concurrent load can only slow down, never fail.
- **`version_number` is the Dataset's Revision**, shown read-only on the metadata page beside the free-text `version` field, which is unrelated. **`data_updated_at`** records when the published data last changed: a publish, a version publish, or a Raster Load that removed layers.
- **A publish's cost grows with v2's size and its collisions with v1.** It runs in one transaction under a statement timeout, measured on production-sized increments before release. A failed publish leaves v2 LOADED, with the job's error shown on the version.
