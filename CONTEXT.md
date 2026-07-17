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
A persisted combination of one or more AOI geometries and parameter criteria (date range, depth range, soil properties, data types, licenses, visibility, raster filters). Used to scope all data queries. Filters are deduplicated per owner by **content identity**: submitting an equivalent combination reuses the existing Filter rather than creating a new one, so a client may receive back a Filter whose stored raw form differs byte-wise from what it submitted.
_Avoid_: Query, search, selection

**Content identity** (of a Filter):
What makes two Filter submissions "the same Filter": the same owner, the same *set* of canonical UserGeometries (order and duplicates irrelevant), and equivalent parameter criteria (list-valued criteria compare as sets; an explicitly null criterion is **not** the same as an absent one). Byte equality of the submission is neither necessary nor sufficient.
_Avoid_: Hash, checksum (mechanisms, not the concept), equality (too generic)

**AOI (Area of Interest)**:
The effective spatial geometry used for a query. For the DAI, this is the intersection of the Filter's geometries with the current map viewport bounding box.
_Avoid_: Geometry, polygon, bounding box (when referring to the combined effective area)

**UserGeometry**:
A user-supplied Polygon or MultiPolygon stored in PostGIS format, representing one spatial boundary within a Filter's AOI definition. Persisted in the `user_geometries` table. What is stored is the **canonical form** of the submitted geometry — validity-normalised at write time — so the stored bytes may differ from what the client submitted. UserGeometries are deduplicated by canonical content identity: submitting an equivalent geometry reuses the existing stored row unchanged. Distinct from a Feature, which is a soil sampling location within a Dataset.
_Avoid_: Feature, AOI (a UserGeometry is one component of the AOI, not the AOI itself), geometry (too generic)

**Canonical form** (of a UserGeometry):
The validity-normalised representation of a submitted geometry, produced once at write time. Content identity (and therefore deduplication) is defined over the canonical form, not the raw submission. A stored canonical form is immutable — resubmitting an equivalent geometry never rewrites it.
_Avoid_: Normalised geometry, cleaned geometry, validated geometry

**Visibility**:
A Dataset attribute: `public` or `private`. Private Datasets are still discoverable by everyone — visibility governs which capabilities (preview, download) require an entitlement, not whether the Dataset appears in results. As a Filter criterion, visibility matches Datasets by this attribute alone; it is entitlement-agnostic: filtering on `private` returns *all* private Datasets, not "private Datasets I can access". Absent means unconstrained; there is no null form (every Dataset has a visibility).
_Avoid_: Access level, permission, "my datasets" (entitlement concepts — a different axis)

**Data Availability Index (DAI)**:
A composite score that quantifies the richness of soil data within an H3 cell. Computed on-demand per filter + viewport. Only point and polygonal features contribute; raster datasets are excluded from scoring.
_Avoid_: Data density, coverage score, heatmap score

**Coverage map**:
The map visualisation of the DAI — the hexagonal heat layer users see in the UI (widget title: "Coverage map"). The map is the picture; the DAI is the number it colours by. Use "Coverage map" in user-facing text and "DAI" for the underlying score.
_Avoid_: Heatmap (rendering detail), coverage score (conflates map and score), density map

**H3 Cell**:
A hexagonal grid cell from Uber's H3 library, identified by an H3 index string. The spatial unit of aggregation for the DAI.
_Avoid_: Hex, hexagon, grid cell

**CRS (Coordinate Reference System)**:
The spatial reference system of a soil data file, expressed as an EPSG code in the form `EPSG:<number>`. Every ingested file must have one, either inferred or supplied by the data admin. The set of accepted codes is the EPSG registry subset served by the `/epsg` endpoint.
_Avoid_: Projection (a CRS component, not the whole), SRID (database-level identifier)

**Inferred CRS**:
The CRS detected by the backend from an uploaded file's own metadata during upload. When present it is authoritative: the data admin cannot override it. Distinct from a user-supplied CRS, which is required only when inference fails.
_Avoid_: Default CRS, detected projection

## Relationships

- A **Dataset** contains one or more **Features**
- A **Feature** has one or more **DatasetLayers**
- A **DatasetLayer** links a **Feature** to a **Layer** and a **Soil Property**
- A **DatasetLayer** has one or more **Observations**
- A **Layer** carries the `sampling_date`, `min_depth`, and `max_depth` for its associated **Observations** — there is no date on **Observation** itself
- A **Filter** defines the scope for **DAI** computation; the effective **AOI** is the intersection of the Filter's geometries with the map viewport
- A **Filter** has a *set* of zero or more **UserGeometries** (duplicates in a submission collapse to one); each **UserGeometry** may belong to more than one **Filter**

## Example dialogue

> **Dev:** "When we compute the DAI, do we count observations or layers for the date signal?"
> **Domain expert:** "Layers — an observation has no date of its own. The sampling date lives on the layer, so we count distinct layers with a non-null date."

> **Dev:** "If a filter has no geometries, what's the AOI?"
> **Domain expert:** "The viewport bounding box is the AOI. Geometries clip the bbox; without them, the whole viewport is in scope."

**Preprocessing Steps** (`preprocessing_steps`):
An optional free-text field on a Dataset that documents the data cleaning and transformation steps applied to the raw source data prior to ingestion. Set by data admins; not computed by the system.
_Avoid_: Processing instructions, pipeline steps, ETL steps

**Related Resources** (`related_resources`):
An optional list of external URLs associated with a Dataset (e.g. publications, source repositories, data provider pages). Set by data admins; not computed by the system.
_Avoid_: Links, references, attachments

## Flagged ambiguities

- The UI's **"Data access"** filter (options "Private"/"Public") filters by **Visibility** — the entitlement-agnostic Dataset attribute. Selecting "Private" means "datasets whose visibility is private", never "datasets I have access to". Likewise the UI's **"Data type"** filter maps to the `data_types` criterion (`gis_datatype`). In domain discussions prefer **Visibility** and **data type**; "access" is a UI label only.

- "dataset ID" in the public API means the Dataset's `slug`, not its database primary key: `GET /data-filters/{filterId}/datasets` returns the slug in the `id` field, and the `datasets` query parameter of `GET /soil-data` matches against slugs. In domain discussions, say **slug** when you mean the public identifier and reserve "ID" for the internal primary key.
- "layer" was used in the codebase to mean both the domain entity (depth/date slice) and Mapbox/map rendering layers — in domain discussions, **Layer** always refers to the soil data entity.
- "observation" was initially used loosely to mean any data point or measurement; resolved: **Observation** is specifically a row in the `observations` table with a numeric `value`, linked to a **DatasetLayer**.
- A **null** parameter criterion and an **absent** one mean different things and yield different Filters: `min_depth: null` means "match Layers with no recorded depth", while omitting `min_depth` means "no depth constraint" (same for `max_depth` and the sampling-date criteria). Never normalise null to absent (or vice versa) when comparing filter criteria.
