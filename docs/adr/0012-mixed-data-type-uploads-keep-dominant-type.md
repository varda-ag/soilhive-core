# Mixed-data-type uploads keep the dominant data type

When a vector upload mixes Data Types (SP-5450), the cleaning step keeps only the rows of the dominant Data Type — the one with the most raw rows — and discards the rest with row-delete reason `mixed_data_type`. Ties are broken in favour of `point` over `polygonal`. The contest is at the Data Type level, not the Geometry Type level: Polygon and MultiPolygon rows count together as `polygonal` and may coexist in one Dataset. Geometry types that map to no supported Data Type (LineString, MultiPoint, GeometryCollection, …) never compete and are always discarded under the same reason.

## Considered options

- **Keep the dominant type, discard the rest (chosen).** Preserves the invariant that a Dataset has exactly one Data Type (`updateDatasetMetadata` derives `gis_datatype` from feature geometries and the DAI, exports, and filtering all assume one modality per Dataset) while still letting a mostly-clean file through. The discard is visible, not silent: counts surface as `mixed_data_type` in the cleaning report and the rows disappear from the admin preview before publication.
- **Fail the upload (rejected).** Real-world provider files often contain a handful of stray geometries; rejecting the whole file for a few bad rows makes ingestion needlessly brittle when every other cleaning rule already repairs-or-discards per row.
- **Split into one Dataset per type (rejected).** Breaks the 1 upload → 1 Dataset model that the admin publication flow, metadata inference, and entitlements are built around.

## Consequences

- The tally is over **raw rows** (pre-cleaning, NULL geometries excluded), consistent with how full-row duplicate detection partitions on raw values — so duplicates, invalid coordinates, and user-dropped rows still count toward their type's total.
- `mixed_data_type` sits first in the `final_row_delete_reason` CASE: a losing-type row is always reported under this reason even if it is also a duplicate or user-dropped, and never lingers in the preview.
- `toGisDatatype` maps `ST_MultiPolygon` → `polygonal`, and `updateDatasetMetadata` asserts one *Data Type* (not one geometry type) per Dataset.
