# ADR 0015: Frontend logo bytes are stored in `jsonstorage`, not object storage

The custom frontend logo is persisted as base64-encoded bytes inside the `data` jsonb of the `jsonstorage` row `id='frontend-logo'` (`{ fileKey, bytes }`), rather than living in disk/S3 object storage like every other uploaded file. This keeps a single small branding asset entirely inside the database (one backup/restore, no storage dependency to serve it) and requires no migration because `data` is already `jsonb`. Reads remain backward compatible: a row without `bytes` falls back to streaming the file from storage as before.

## Considered Options

- **Keep the logo in object storage (status quo)** — rejected for the primary path. It coupled logo availability to storage configuration and left the branding asset outside the config data that is otherwise self-contained in `jsonstorage`.
- **Store bytes in the `jsonstorage` jsonb** — chosen. No schema migration; the logo travels with the config. `jsonb` cannot hold raw binary, so bytes are base64-encoded (≈33% inflation, negligible for a logo).

## Consequences

- The upload path has an unavoidable double-write: the global OpenAPI multer `fileUploader` streams the file to storage *before* the controller runs, so `logoUpload` reads the bytes back, upserts the row, and *then* best-effort deletes the storage copy. Ordering is deliberate — the DB write commits before the storage delete, so a failed cleanup leaves a harmless orphan rather than losing the logo.
- Resolution is centralized in `FileService.getLogo(repo)` (bytes ⇒ decode; else stream from storage; no row ⇒ null) and shared by the download route and the PDF export, so the fallback logic lives in one place.
- `logoDelete` skips the storage delete when `bytes` are present (a DB-backed logo has no storage copy) and only deletes from storage for legacy rows.
- The public logo API is unchanged; `Content-Type`/filename are still derived from the retained `fileKey`.
