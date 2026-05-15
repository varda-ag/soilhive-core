# SoilHive

SoilHive is a platform for discovering, filtering, and visualising soil datasets from multiple providers on a spatial map.

## Language

**Dataset**:
A collection of soil features ingested from a single data provider. Has a `gis_datatype` of `point`, `polygonal`, or `raster`.
_Avoid_: Data source, layer (overloaded)

**Feature**:
A single spatial geometry (point or polygon) that represents a physical sampling location within a Dataset.
_Avoid_: Sample, location, site

**Layer**:
A depth/date slice within a Feature. Carries `min_depth`, `max_depth`, `horizon`, and `sampling_date`.
_Avoid_: Measurement, record

**DatasetLayer**:
The join record that links a Feature to a Layer within a Dataset and associates it with a soil property. The atomic unit that a soil property measurement is attached to.
_Avoid_: Measurement record, join

**Observation**:
A single numeric measurement value. Each Observation belongs to exactly one DatasetLayer (and thus one soil property + one Layer).
_Avoid_: Measurement, value, data point

**Soil Property**:
A measurable characteristic of soil (e.g., pH, organic carbon). Identified by a `slug`.
_Avoid_: Attribute, variable, parameter

**Filter**:
A persisted combination of one or more AOI geometries and parameter criteria (date range, depth range, soil properties, data types, licenses, raster filters). Used to scope all data queries.
_Avoid_: Query, search, selection

**AOI (Area of Interest)**:
The effective spatial geometry used for a query. For the DAI, this is the intersection of the Filter's geometries with the current map viewport bounding box.
_Avoid_: Geometry, polygon, bounding box (when referring to the combined effective area)

**Data Availability Index (DAI)**:
A composite score that quantifies the richness of soil data within an H3 cell. Computed on-demand per filter + viewport. Only point and polygonal features contribute; raster datasets are excluded from scoring.
_Avoid_: Data density, coverage score, heatmap score

**H3 Cell**:
A hexagonal grid cell from Uber's H3 library, identified by an H3 index string. The spatial unit of aggregation for the DAI.
_Avoid_: Hex, hexagon, grid cell

## Relationships

- A **Dataset** contains one or more **Features**
- A **Feature** has one or more **DatasetLayers**
- A **DatasetLayer** links a **Feature** to a **Layer** and a **Soil Property**
- A **DatasetLayer** has one or more **Observations**
- A **Layer** carries the `sampling_date`, `min_depth`, and `max_depth` for its associated **Observations** — there is no date on **Observation** itself
- A **Filter** defines the scope for **DAI** computation; the effective **AOI** is the intersection of the Filter's geometries with the map viewport

## Example dialogue

> **Dev:** "When we compute the DAI, do we count observations or layers for the date signal?"
> **Domain expert:** "Layers — an observation has no date of its own. The sampling date lives on the layer, so we count distinct layers with a non-null date."

> **Dev:** "If a filter has no geometries, what's the AOI?"
> **Domain expert:** "The viewport bounding box is the AOI. Geometries clip the bbox; without them, the whole viewport is in scope."

## Flagged ambiguities

- "layer" was used in the codebase to mean both the domain entity (depth/date slice) and Mapbox/map rendering layers — in domain discussions, **Layer** always refers to the soil data entity.
- "observation" was initially used loosely to mean any data point or measurement; resolved: **Observation** is specifically a row in the `observations` table with a numeric `value`, linked to a **DatasetLayer**.
