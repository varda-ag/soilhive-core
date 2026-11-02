# Export Limits are also checked at submission, within a time budget

`POST /jobs` checks a new Export against its Export Limits and the XLSX record cap before enqueueing it, and refuses it with `400` and the message the job would fail with. The area needs no count; the Observation and Raster Layer counts run side by side on pooled connections and share `EXPORT_LIMITS_CHECK_TIMEOUT_MS` (default 5s), connection waits included. When it runs out they are cancelled, the request is enqueued as before and the job stays the authority. Only the timeout lets a request through: any other error fails it.

This revisits ADR 0035's rejection of enqueue-time checks. Its objection was a 60s count inside an HTTP request; a bounded budget removes it.

## Considered options

- **A separate check endpoint returning the counts**: rejected. The counts are never shown, and only clients that call it first would benefit.

## Consequences

- An Export submission can take up to 5s longer. With no count-based limit to apply, the counts are skipped.
- API and plugin clients can now get a `400` for an Export over a limit.
- The job always counts and checks again: data or limits can change after submission, and job data comes from the request body, so counts stored there could not be trusted.
