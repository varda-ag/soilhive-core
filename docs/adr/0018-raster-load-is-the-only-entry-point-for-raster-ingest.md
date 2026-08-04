# ADR 0018: A Raster Load is the only entry point for a Raster Ingest; CLI raster ingestion is removed

**Status:** Accepted — supersedes part of ADR 0004

## Context

Raster ingestion had two entry points: the `--ingest-raster` CLI flag, and the Raster Load job. The CLI passed every piece of layer metadata as a flag — dataset name, soil property name, category name, unit, laboratory method — and the ingest service upserted whatever did not yet exist.

Multiband support made the two paths diverge irreconcilably. A band's metadata has to be declared per band, and the CLI's flat flags can only describe one band per invocation, with no way to state which band they describe or to keep sibling bands' metadata related. Worse, because the CLI supplied *names* rather than references, the ingest had to be able to conjure datasets, soil properties, categories, vocabulary entries and procedures into existence — so a typo in a flag silently created a new soil property instead of failing.

ADR 0004 framed one-off CLI ingestion as a supported context ("callable from any context (CI, manual ops, data pipelines)"). That framing no longer holds.

## Decision

Remove raster ingestion from the CLI. A Raster Ingest is reachable only through a Raster Load, which resolves each band from the file's band mapping (ADR 0017).

Because a Raster Load always has the dataset and the file in hand, the ingest presumes both already exist:

- It takes their identifiers rather than their names, and creates neither.
- It writes no dataset-level metadata. The dataset metadata step is the single writer of `n_raster_layers`, spatial extent, resolution, depth range, reference period and measured properties.

`convert_raster.sh` is unaffected: converting a GeoTIFF to a COG remains a standalone, prior step, exactly as ADR 0004 decided. (Superseded by ADR 0024: removing the CLI left nobody positioned to run that prior step, so the loader now normalizes the file itself and the script is gone.)

## Consequences

- **One-off raster ingestion now requires a dataset, an uploaded file and a band mapping.** There is no longer a way to ingest a raster from a shell against an ad-hoc dataset name. This is the real cost of the decision; it is accepted because the alternative was maintaining a second metadata path that cannot express per-band mapping and that creates catalog entities from free text.
- Both hardcoded `'data-admin'` values in the ingest disappear along with the file and dataset inserts that contained them. They were never identities — `data-admin` is a token *scope*, while every other write path records a subject — so no row need carry that value again. Provenance for a Raster Load is recorded at the dataset level by the metadata step.
- The ingest's only remaining callers are the Raster Load job and test fixtures, so its signature is free to be narrow: identifiers, one band, and that band's declared metadata.
- Preconditions the CLI checked loosely are now job failures with actionable messages: a missing band mapping, a band the file does not have, input that is not a COG, and pixel values not already in the property's standard unit. (The last two stopped being failures under ADR 0024 — the loader normalizes both instead.)
