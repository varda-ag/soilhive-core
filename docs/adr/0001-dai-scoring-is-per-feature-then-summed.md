# DAI scoring is computed per feature then summed per H3 cell

The Data Availability Index score for an H3 cell is the sum of per-feature scores across all features whose centroid falls in that cell. Each feature contributes independently: `num_soil_properties + num_props_below_30cm + num_dated_layers + num_distinct_years`.

## Considered options

**Cell-level distinct aggregation** — compute distinct counts (e.g., distinct soil property IDs) across *all* features in a cell at once. This is more semantically precise: if two features in the same cell share soil property P1, it counts once. It would require either pushing H3 indexing into the SQL (needs a PostGIS H3 extension not currently available) or returning raw row-level data to Node.js and aggregating there (high data volume). Rejected for the POC phase.

**Per-feature then summed (chosen)** — aggregate in SQL per feature, assign each feature to its H3 cell in the service layer, sum the scores. Simpler, fast, and works with the existing query pattern. Accepted that shared soil properties between features in the same cell are double-counted.

## Consequences

Cells with many features that share the same soil properties will have inflated scores relative to their true distinct richness. This is acceptable for visualisation purposes at POC stage and can be revisited if precision requirements tighten.
