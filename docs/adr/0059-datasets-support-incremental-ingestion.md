# Datasets support incremental ingestion

A Dataset that is already LOADED or PUBLISHED can take more Files, and a loaded raster File can have its Band Mapping edited. A load ingests only what is new or changed since the last one, and leaves loaded Files that nobody touched as they are.

- **What a load picks up.** Only Files waiting for a load. A bulk load already took only STAGED Files. A Raster Load now takes only PENDING ones, where it used to re-ingest every mapped File on every run. Editing a loaded raster File's Band Mapping puts the File back to PENDING, which `updateMapping` does only when the mapping's content changed, since the mapping steps post a fresh data mapping on every save. A loaded vector File cannot be re-mapped, because its raw table is dropped once it is loaded.
- **How a raster edit is applied.** The Raster Load compares the current Band Mapping with `files.metadata.loaded_bands`, a record of what decided how each band's pixels were written: standard unit, original unit, conversion formula and whether the band is categorical.
  - Nothing in that record changed: the Raster Layers are updated in place, with no re-read and no new footprints. This covers attaching Raster Layer Assets to a loaded layer afterwards: adding a resource to a band's mapping links it to the existing layer without ingesting the File again.
  - It changed, or a band was added: the File is normalized again from its source (`files.metadata.source_file_path`) and every band is ingested again. A flip between categorical and continuous also rebuilds the COG's overviews.
  - A band or resource the mapping no longer declares: its Raster Layer or Raster Layer Asset is deleted.
- **The Dataset during a load.** Both loaders move the Dataset to ONGOING for the whole job, so a published Dataset disappears from the catalog, queries and the DAI rollup instead of being served half-loaded. The hide refreshes the DAI rollup and bumps the cache epoch straight away (`hideDatasetForLoad`). On success a PUBLISHED Dataset is published again, and anything else ends LOADED.
- **When a load fails.** Both loaders follow one rule: a failed load never leaves half-loaded data on show. They differ in how, because only a Raster Load can tell what it wrote. Raster Layers carry their `file_id`, while vector records are committed batch by batch through the soil-data endpoint into deduplicated `features`, `layers` and `dataset_layers` rows that record no source File.
  - Raster Load: deletes the layers of every File it had started writing to and puts those Files back to PENDING with `loaded_bands` cleared, so the retry ingests them from scratch. Edited files it had not reached keep their layers. The Dataset then gets its previous status back, since nothing half-written is left to show.
  - Bulk load: leaves the Dataset PENDING, published or not. Its batches are not rolled back, so a published Dataset must not be shown again until a load succeeds.

## Considered options

- **Re-ingest every mapped raster File on each run**, as before: rejected, because adding one File re-read and retraced every File, with the Dataset hidden throughout, and a re-run could not tell that an earlier normalization had already scaled the pixels.
- **Always re-ingest an edited raster File in full**: simpler, with no diff, but rejected because a description or depth fix would pay for a full normalization and footprint pass.
- **A `status` column on `dataset_file_mappings`, and a `conversion_id` column on `raster_layers`**: rejected in favour of `files.status` and the jsonb `files.metadata`, which need no migration. A `loaded_data_mapping_id` alone would not do: diffing two mappings would re-resolve both against today's soil properties and unit conversions rather than the ones the File was loaded with, and the old mapping row can be deleted.
- **Keep the Dataset visible while it loads**: rejected, because new records would appear partway through a load.
- **The same failure handling for both loaders**: rejected for now.
  - Leaving a raster Dataset PENDING too would take a published Dataset offline when its remaining state is clean.
  - Rolling a bulk load back would need vector records to carry their source File, for example a `file_id` on `dataset_layers`: a migration, a change to the soil-data write path, and no rollback for data loaded before it.
  - If vector records gain that link, both loaders should give the Dataset its previous status back.

## Consequences

- Adding a File costs what loading that File costs, whatever the Dataset already holds.
- `files.status` is the "needs a load" flag, which assumes a File belongs to one Dataset.
- A loaded vector File's mapping is read-only: `updateMapping` refuses a content change with 409, and the preview step hides loaded Files.
- A normalization always starts from the source, so the File-level `unit_conversion_applied` flag can no longer hide a conversion added to another band later.
- A scaled File converted before `source_file_path` was recorded falls back to the `_cog.tif` naming convention. If its original is gone, a conversion change fails with `RL_SOURCE_FILE_NOT_FOUND`.
- Deleting layers on failure removes them from Raster Layer groups, and the retry recreates them with new ids.
- A worker that dies mid-load leaves the Dataset ONGOING. The previous status is not stored, so a retry ends it LOADED and it has to be published again by hand.
