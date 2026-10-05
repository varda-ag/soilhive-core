# Soil Index Runs mirror Data Requests, but attachment guards only the record

`POST`, `GET` and `DELETE /soil-indexes/{id}` follow `/data-requests` (ADRs 0037 and 0041): the Run id is the permission, `soil-indexes` leaves `POST /jobs`, every outcome is recorded in `soil_index_runs` so it survives the job, and `config_id` is optional. One rule differs. On an attached Run, `read` and `write` on the config item gate the Run's record and its destruction, but never its scores: the tiles, the per-score endpoint and Data Requests naming the Run (ADR 0039) still need only the id.

## Considered options

- **Attachment gates the scores too.** Every tile and score request would need a token and a config check. That is the deferred private-tiles work (ADR 0043), so it was not pulled in here.
- **No attachment for Soil Index Runs.** Any reader of a dashboard could then destroy its Runs, which is what ADR 0041 fixed.

## Consequences

- Attaching protects a Run from being destroyed, not from being read. The plugin guide says so.
- Destroying a Run is housekeeping (ADR 0043): it removes the record, the partitions and the tiles, never a Data Request that named it. A completed Data Request keeps its answer, and a pending one fails.
- Deleting a plugin config item destroys its attached Runs, as it does its Data Requests.
