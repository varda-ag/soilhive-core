# Raster Filter Installation consumes its source File

**Status:** Accepted

Every other upload is kept: a Raster Layer's COG, a Dataset's files. A Raster Filter's source File is deleted once its Installation succeeds. Only the chosen band is loaded and the rest are discarded with the File, and `file_id` is set to NULL. Re-installs aren't supported (a new data version is a new Raster Filter), so after a successful install the File's only use would be provenance, and filter sources run to several GB.

## Consequences

- `file_id` means "the File awaiting Installation" and is NULL on every installed Raster Filter. Provenance can't be recovered for filters installed under this rule.
- `POST /raster-filters` requires exclusive ownership of the File. It returns 409 if any Dataset File Mapping, Raster Layer Asset or other Raster Filter references it, since the job will destroy it.
- The File is deleted after the rename transaction commits. If that delete fails, the File is left `PENDING` and unreferenced, and orphan cleanup collects it.
- A failed install keeps the File, so `DELETE` + `POST` can retry without re-uploading. While a row references the File, orphan cleanup skips it and `DELETE /files/{id}` returns 409.
