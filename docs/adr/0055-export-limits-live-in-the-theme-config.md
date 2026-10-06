# Export Limits live in the theme config

Export Limits are enforced by the export job but stored as `exportLimits` inside the frontend's `theme` config, not under a config id of their own. The admin page reuses ThemeContext's load and save, so there is no new endpoint, migration or Entitlement grant. The job reads `theme` fresh when it starts; a missing key means unlimited.

## Considered options

- **Dedicated `export-limits` config id**: rejected, it duplicates ThemeContext's load/save path and needs its own `everyone` read grant for the planned pre-submit check.
- **Environment variables, like `EXPORT_XLSX_MAX_RECORDS`**: rejected, administrators must change limits without a redeploy.

## Consequences

- The limits are public, since `theme` is readable by `everyone`. Harmless for a server-load bound.
- Theme pages save the whole object from their cached copy, so a stale save from another theme page silently resets the limits. Accepted: the existing theme pages already overwrite each other this way.
- `ConfigItem` has no schema, so the job validates each limit on read. An invalid limit is ignored with a warning and the others still apply; a non-boolean `exemptAdmins` is `false`.
- Moving the limits out later means migrating the key in every deployment's `theme` row, frontend and backend together.
