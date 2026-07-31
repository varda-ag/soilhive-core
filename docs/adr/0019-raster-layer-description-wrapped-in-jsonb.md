# ADR 0019: A Raster Layer's description is prose wrapped in jsonb, not a text column

**Status:** Accepted

## Context

Band Mappings gained an optional `layer_description` — free prose an admin writes about what one Band's Raster Layer contains. It has to land on `raster_layers.description`, a `jsonb` column created with the original schema and, until now, never written by anything: no code in `src/` or the frontend read or wrote it, and `RasterLayer.description` was typed `object | null`. Its sibling `raster_layer_assets.description` is in the same state.

The obvious move is to convert the column to `text`. Nothing had ever written it, so the conversion carries no data risk, and `datasets.description` is already plain `text` — prose in a `text` column is what the rest of the schema does.

## Decision

Keep the column `jsonb` and store `{"description": "<layer_description>"}`.

A Raster Layer's description is the only descriptive field it has *today*. Unlike a Dataset's, it describes one Band of one File, and the metadata a Band accumulates has only grown — procedure, unit conversion, reference period were all added after the fact (ADR 0017). Keeping the column structured means the next descriptive facet is an added key, resolvable in the same write, rather than a column type change plus a backfill.

## Considered options

**Migrate the column to `text`.** Simplest to read and consistent with `datasets.description`. Rejected because it trades an extension point away for a syntactic saving of one JSON wrapper, at exactly the moment the field acquires its first writer — the cheapest moment to choose the shape, and the last one before rows exist.

**Store a bare JSON string scalar (`to_jsonb($n::text)`).** Keeps the column type and needs no wrapper. Rejected because the interface then has to widen to `string | object | null` and every future reader handles both, so the column's declared type stops telling you what is in it — the same ambiguity a `text` column would have, minus the readability.

## Consequences

- **The field reads as `description.description`.** Accepted: the redundancy is at the read site, and the alternative is a key like `text` that says less about what it holds.
- Reversing this later means a data migration over rows this feature created, not just an `ALTER COLUMN`. That is the real cost of the decision, and it is bounded — only Raster Loads run since this change write the column.
- `raster_layer_assets.description` stays `jsonb` and stays unwritten. When it acquires a writer, it should follow the same shape rather than re-open this question for the sibling table.
- The write happens inside the Raster Ingest's existing `ON CONFLICT DO UPDATE`, so a re-run refreshes the description from the mapping and clears it when the mapping drops it — the Band Mapping is authoritative for it, as it is for every other Raster Layer field.
