# A Run never takes its Aggregation Units from a File mapped to a Dataset

**Status:** Accepted

A Data Request or Soil Index Run may take its Aggregation Units from a File (`file_id`), and any File could be named, a Dataset's own source file included. For a polygonal Dataset that published every polygon through the Run's derived Filter, and one attribute per Run through `label_field`, with no Entitlement check and whether or not the Dataset was Published. A File with any Dataset File Mapping, Superseded ones included, is now answered as unknown: 404 at submission, `RUN_FILE_NOT_FOUND` in the Run.

## Considered options

- **Only a File the caller uploaded**: rejected. Only data admins upload Files, so other callers could name none.
- **A mapped File for a caller holding `download` on its Dataset**: rejected. A Run cannot see external Entitlements, and one File can be mapped to several Datasets.

## Consequences

- To use a Dataset's polygons as Aggregation Units, upload them again as a File of their own.
- Mapping a File fails the Runs already queued with it.
- A Raster Layer Asset is not a Dataset File Mapping. The admin console uploads assets as Non-spatial Files, which a Run refuses, but a Spatial File attached as an asset through the API could still be named.
