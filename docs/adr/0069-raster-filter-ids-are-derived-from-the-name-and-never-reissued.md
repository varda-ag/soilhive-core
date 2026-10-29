# Raster Filter ids are derived from the name and never reissued

**Status:** Accepted

The admin chose a Raster Filter's id, and `DELETE` freed it. Saved Filters keep their `raster_filters.<id>` values after a delete, so a new filter created under the same id brought those values back onto a raster where they may mean other classes. `POST /raster-filters` now derives the id from the name (snake_case, `rf_` before a leading non-letter, `_2`, `_3`... when taken), and `DELETE` soft-deletes the row so the id stays taken.

## Considered options

- **The slug machinery** (trigger, `slug_history`). Rejected: slugs follow renames, but the id is the table name and the key in saved Filters, and the hyphens `slugify` uses do not fit an unquoted table name.

## Consequences

- The id doesn't follow a later rename, so the two can drift apart.
- Retrying a failed install after `DELETE` gives the new filter a suffixed id.
- `DELETE` also clears `file_id`, so a failed install's File is left to orphan cleanup, as before.
