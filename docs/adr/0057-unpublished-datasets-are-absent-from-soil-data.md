# Unpublished Datasets are absent from `/soil-data` too

**Status:** Accepted — amends ADR 0034

`GET /soil-data` now ignores every slug whose Dataset is not `PUBLISHED`, unless the caller is a
Privileged caller. ADR 0034 left this path open on purpose ("Published means listed, not
released"), so anyone holding an unpublished Dataset's slug could read its data. It was the last
such path: exports and data requests already refuse unpublished Datasets. Only Published data,
public or private, should be reachable by a non-privileged caller.

Ingestion Status is still not an access axis. An unpublished Dataset is *absent* to a
non-privileged caller, not forbidden.

## Considered options

- **404 the request if any slug is unpublished**: rejected. On this endpoint an unknown slug
  returns 200 and contributes no rows, and an unpublished one must be indistinguishable from it.
- **`status = 'PUBLISHED'` in the SQL**: rejected. The raster candidate query is cached for 12
  hours and expires on TTL alone (ADR 0008), so an unpublished Dataset would stay readable for that
  long. Slugs are filtered instead by an uncached query that runs before any data query.
- **Skip unpublished Datasets inside `enforceEntitlements`**: rejected. It would cover every
  caller at once, but it fails open. A future data path that forgot the status filter would then
  serve private, unpublished data with no entitlement check. With the filter at each call site, a
  path that forgets it leaks only existence (a 403), never data.

## Consequences

- The status filter runs before `enforceEntitlements`. Otherwise a private, unpublished Dataset
  answers 403, which confirms that it exists. Export and data-request submission
  (`JobService.createJob`) apply the same filter to their entitlement check. They leave the job
  payload alone, so the run treats an unpublished slug as unknown: an export fails with 404, and a
  data request leaves the dataset out.
- When no slug survives the filter, `getSoilData` returns `[]` without querying, because
  `buildRawSoilQuery` cannot take an empty slug list.
- Unpublishing a Dataset now takes its data out of reach of non-privileged `/soil-data` callers,
  which reverses ADR 0034's "unpublishing is not a containment measure".
- Raster export layers used to require `PUBLISHED` for every caller. That predated the privileged
  bypass and was never decided, so a privileged export silently left them out. They now use the
  same slug filter, so privileged callers get them.
- Privileged callers are still treated inconsistently, and this ADR leaves the rest alone. They see
  unpublished Datasets in `/datasets`, `/soil-data` and exports, but not in filter results,
  coverage, DAI or data requests.
