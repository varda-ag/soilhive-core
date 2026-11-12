# A dashboard is readable only with access to its datasets

Policy (SP-5956): a user entitled to a dashboard must also be entitled to each private Dataset it uses. `GET /configs/{configId}` checks this for ids of the `dashboards` Config Kind only. It reads the top-level `datasets` array of the stored value, and needs `preview` on each private Dataset that names. A Dataset that is unpublished or deleted also fails the check. The 403 is a problem body with two extension members: `datasets` (the private Datasets the caller can request access to) and `has_unavailable_datasets` (a flag, with no ids, so an unpublished Dataset stays absent as ADR 0057 says). Data Requests and Soil Index Runs attached to such a config apply the same check, so their results cannot be read past it. Privileged callers skip the check.

## Considered options

- **Check any config that has a top-level `datasets` array**: rejected. A config value has no schema, so any plugin could turn the check on or off by chance.
- **List unpublished Datasets by id**: rejected. It shows that an unpublished Dataset exists to callers who cannot see it anywhere else.
- **A separate endpoint for the check**: rejected. The config value would still be readable without it.

## Consequences

- The generic config route depends on one field of the dashboards plugin's data. If the plugin renames or stops writing `datasets`, the check passes for every caller with no error. A dashboard saved without `datasets` is not checked.
- The check uses `datasets` only. Datasets reached through `filter_id` but not listed in `datasets` are not checked.
- `GET /configs` (the list) keeps every readable row, and the 403 comes only when the dashboard opens. For a caller the check blocks, the list leaves out `soilIndexRunId`: the Soil Index tiles stay open to anyone with the run id (ADR 0043, 0044), so the id must not reach that caller.
- `GET /configs` returns a fixed summary (`name, type, visibility, status, soilIndexRunId, framework, updated_by`) for `dashboards` Config Kind ids, not the full value. A new column in the dashboard list needs a backend change.
