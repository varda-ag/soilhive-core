# Raster Filter mappings are keyed by pixel value

**Status:** Accepted

A Raster Filter's `mappings` were `{ label: pixel value }`, so a label could name only one value. Rasters often give several codes one class (a raster attribute table naming 111 and 112 both "Forest"), and the suggested labels silently dropped the second code. Mappings are now `{ pixel value: label }`: several values may share a label, and one label per value is enforced by the JSON keys rather than by a check. `suggested_mappings` and a File's `category_labels` take the same shape.

## Consequences

- Breaking for API clients and for plugins (`PluginRasterFilterCategory.mappings` in `frontend-plugin-types`). It was changed before `PUT /raster-filters/{id}/mappings` and the republished packages shipped, which was the cheapest moment.
- Filters still store pixel values, so saved Filters and query results are unaffected. A label is a display grouping: selecting it selects all of its values.
- Regrouping labels later can leave a saved Filter holding only some of a label's values. It still matches exactly those pixels, and the label shows as selected.
- Existing rows are inverted by a migration. Reverting it keeps one value per shared label.
