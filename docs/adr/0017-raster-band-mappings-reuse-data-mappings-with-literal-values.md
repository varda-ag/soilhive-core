# ADR 0017: Raster band mappings reuse `data_mappings`, with literal values instead of column references

**Status:** Accepted

## Context

With CLI raster ingestion removed (ADR 0018), a Raster Load is the only thing that can start a Raster Ingest, so it needs a per-band declaration of what each band measures: soil property, depth range, and optionally procedure, unit conversion and reference period. Nothing recorded that.

For point and polygonal files this information already exists as a data mapping: a jsonb object in `data_mappings`, linked to a file through `dataset_file_mappings`, content-hashed for deduplication. Its entries are keyed by **source column name**, and the value says what that column supplies — a `PropertyMapping` object for a soil property column, or a string naming a canonical field for a metadata column. A band is a natural analogue of a column: it is the addressable unit within the file that holds measurements.

The analogy breaks for metadata. A column mapping is a *reference* — "the column named `sample_date` supplies the sampling date". A band has no columns to point at, so a band's depth and reference period are *literal values*.

## Decision

Store raster band mappings in `data_mappings`, using the same jsonb column and the same `dataset_file_mappings` link, one mapping per file. Keys are band numbers; each value carries the band's property and procedure/conversion slugs alongside its depth range and reference period as literal values. Mappings reference existing entities by slug, and slugs are resolved to ids at parse time.

Raster mappings are parsed by a dedicated function, not by the tabular parser:

- The tabular parser returns column-cleaning configuration (`metadata_cols`, `property_cols`, `drop_records`) — all three are tabular concepts a raster needs none of.
- The tabular parser sanitises every mapping key into a DB-safe SQL identifier. That transformation strips characters a band mapping key cannot afford to lose, and it cannot be loosened because the same function generates SQL identifiers elsewhere.

Bands a mapping does not name are not ingested. This is how uncertainty, count and quality bands are excluded.

## Considered options

**A separate `RasterMappingObject` type with its own storage and parser.** Conceptually cleaner — it would avoid one type meaning two things. Rejected because it would duplicate the slug-resolution logic (soil property, unit conversion, procedure) that the ingest's standard-unit assertion depends on, leaving two divergent resolution paths to keep in step. One documented conceptual overload was judged cheaper than that.

**A distinct top-level section inside the same object.** Rejected as the worst of both: still one type, and the parser needs a branch anyway.

## Consequences

- **A data mapping means two different things depending on the dataset's data type** — references for tabular files, literal values for raster files. This is recorded in `CONTEXT.md` under flagged ambiguities. In discussion, say "column mapping" or "band mapping", never bare "mapping".
- Because mappings reference existing entities by slug, the ingest no longer needs to create soil property categories, soil properties, vocabulary entries or procedures from free-text names. Those upserts existed only to serve a CLI that passed names for things that might not exist; removing them deletes the majority of the ingest's SQL.
- Validation of a band mapping against the file needs no GDAL call: band counts and per-band nodata are already probed and stored in the file's metadata at upload time. A mapping naming a band the file lacks is rejected before any storage read.
- The mapping is validated for every file before the first ingest writes anything, so a misconfigured dataset aborts rather than partially loading.
