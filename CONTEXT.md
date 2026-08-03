# SoilHive

SoilHive is a platform for discovering, filtering, and visualising soil datasets from multiple providers on a spatial map.

## Language

**Public identifier** (`id`):
The only identifier that crosses the API boundary: an entity's **slug** when it has one, its primary key when it has none. Always carried in a key named `id` (or `<entity>_id` when referencing another entity), never accompanied by a separate `slug` key — so a client cannot tell from a payload which of the two kinds it holds, and must never parse or infer it. A database UUID is never exposed for an entity that has a slug; entities without one (data mappings, dataset-file mappings, filters, user geometries, raster layers, raster layer assets, jobs) expose their UUID as `id` because there is nothing better to expose.
_Avoid_: UUID, primary key, internal ID (all internal-only concepts), slug (the *kind of value* an id holds, not the name of the field)

**Dataset**:
A collection of soil features ingested from a single data provider. Has a `gis_datatype` of `point`, `polygonal`, or `raster`.
_Avoid_: Data source, layer (overloaded)

**Feature**:
A physical sampling location: a single spatial geometry (point, polygon, or multipolygon), identified **by that geometry alone** and therefore shared — two Datasets that sample the exact same location reference one Feature, not one each. A Feature belongs to no Dataset; the association runs through **DatasetLayers**, which is why deleting a Dataset only removes a Feature once no other Dataset still references it.
_Avoid_: Sample, location, site, "the dataset's features" (a Dataset references Features, it does not own them)

**Data Type** (`gis_datatype`):
The spatial modality of a Dataset: `point`, `polygonal`, or `raster`. Every Dataset has exactly one. Data Type is coarser than Geometry Type: `polygonal` covers both Polygon and MultiPolygon geometries.
_Avoid_: Geometry type (the finer PostGIS-level concept), format, "data access" (a UI label for Visibility)

**Geometry Type**:
The PostGIS-level type of a single Feature's geometry (`ST_Point`, `ST_Polygon`, `ST_MultiPolygon`). A property of one Feature, not of a Dataset. Two Features with different Geometry Types can share the same Data Type.
_Avoid_: Data type (the Dataset-level modality), shape

**Layer**:
A depth/date slice — `min_depth`, `max_depth`, `horizon`, `sampling_date` and licence — identified **by that combination alone** and therefore shared, exactly like a **Feature**: every Dataset sampling 0–30 cm on the same date under the same licence references one Layer. A Layer belongs to no Feature and no Dataset; a **DatasetLayer** is what ties it to both.
_Avoid_: Measurement, record, "the feature's layers" (a Layer is not owned by a Feature)

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

**Raster Filter**:
A catalog entry describing a raster-backed classification layer (e.g. land cover, soil groups) that a Filter's `raster_filters` criterion can reference by table name. Distinct from a Filter itself — a Raster Filter is a thing that *can be selected*, not a stored query. Carries two independent status flags: `active` (admin-controlled — whether this Raster Filter is offered to users at all) and `enabled` (computed — whether its backing raster table exists and has value mappings). A Raster Filter can be enabled but inactive (functional but hidden), or active but not enabled (offered but not yet backed by data).
_Avoid_: Filter (a persisted query scope; a Raster Filter is a catalog entry a Filter can reference), "active filter" in the query sense (see Flagged ambiguities — unrelated to the `active` column)

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

**Subject**:
The identity a caller acts under: the token's `email` claim, else its `client_id`, else its `sub`. It is what **Entitlements** are keyed by and what every `created_by`/`updated_by` record holds — a job's included, so a job resolves the same Entitlements its submitter had. Not a synonym for the token's `sub` claim, which is only the last fallback and in general is a different string. Which branch supplies the Subject is a property of the deployment's identity provider rather than of the caller: on a deployment whose IdP omits `email` from access tokens, *no* Subject is ever an email address, and every **Entitlement** granted to one is unreachable.
_Avoid_: sub, user, user id, owner, caller (the requester; the Subject is the resolved value it acts under)

**Entitlement**:
A **Capability** (`preview`, `download`, `obfuscate_as_points`) granted over a Dataset either to one **Subject** or to `everyone`. Consulted only for private Datasets — a public Dataset needs none — and granted from two independent sources: rows held locally, and an external entitlements endpoint reachable only while the caller's raw token exists. Entitlements are the access axis; **Visibility** is the attribute axis, and neither substitutes for the other.
_Avoid_: Permission, access right, grant, role

**Data Availability Index (DAI)**:
A composite score that quantifies the richness of soil data within an H3 cell. Computed on-demand per filter + viewport. Only point and polygonal features contribute; raster datasets are excluded from scoring.
_Avoid_: Data density, coverage score, heatmap score

**Coverage map**:
The map visualisation of the DAI — the hexagonal heat layer users see in the UI (widget title: "Coverage map"). The map is the picture; the DAI is the number it colours by. Use "Coverage map" in user-facing text and "DAI" for the underlying score.
_Avoid_: Heatmap (rendering detail), coverage score (conflates map and score), density map

**H3 Cell**:
A hexagonal grid cell from Uber's H3 library, identified by an H3 index string. The spatial unit of aggregation for the DAI.
_Avoid_: Hex, hexagon, grid cell

**File**:
An uploaded blob plus its bookkeeping record. Every File is either **Spatial** or **Non-spatial**, decided once at upload time and never afterwards. A Spatial File is one the backend probes for metadata on upload and that may go on to be ingested as soil data; being spatial does not require the file to contain geometry — a table with no geometry column is still a Spatial File.
_Avoid_: Dataset (a File is raw input; a Dataset is what ingestion produces), upload, document

**Non-spatial File**:
A File uploaded as explicitly non-spatial — documentation, attachments, anything not intended as soil data. Carries no metadata and therefore no CRS, and has no ingestion path. Its contents are never inspected, so they are never rejected either. A Non-spatial File appears in no listing: whoever uploads it must retain the returned slug, which is the only way to reach it again.
_Avoid_: Tabular file (a geometry-less table is a Spatial File), attachment (fine informally, but it names one use rather than the category), invalid file (a Non-spatial File is not a failed upload)

**CRS (Coordinate Reference System)**:
The spatial reference system of a soil data file, expressed as an EPSG code in the form `EPSG:<number>`. Every Spatial File must have one, either inferred or supplied by the data admin; a Non-spatial File has none and never acquires one. The set of accepted codes is the EPSG registry subset served by the `/epsg` endpoint.
_Avoid_: Projection (a CRS component, not the whole), SRID (database-level identifier)

**Inferred CRS**:
The CRS detected by the backend from an uploaded file's own metadata during upload. When present it is authoritative: the data admin cannot override it. Distinct from a user-supplied CRS, which is required only when inference fails. Only Spatial Files have an Inferred CRS — for a Non-spatial File no inference is attempted, which is not the same as inference failing.
_Avoid_: Default CRS, detected projection

**Bulk Load**:
The Dataset-scoped operation that turns a Dataset's staged files into Features, Layers, DatasetLayers and Observations. Operates on point and polygonal Datasets. Scoped to exactly one Dataset; the files it consumes are whichever staged files that Dataset has.
_Avoid_: Import, upload (a separate earlier step), ingest (reserved for the per-file raster operation)

**Raster Load**:
The Dataset-scoped counterpart to Bulk Load for raster Datasets: it walks the Dataset's raster files and performs a Raster Ingest on each. Like Bulk Load it is scoped to one Dataset and named for the Dataset, not for any single file. A Raster Load produces no Features, Layers or Observations — raster data is not modelled as those — and therefore never contributes to the DAI. Unlike a Bulk Load, a Raster Load never consumes its source files: after a Bulk Load the file's contents live in the soil tables and the file is disposable, whereas after a Raster Load the file *is* the raster layer's data and must survive.
_Avoid_: Raster ingest (the per-file operation Raster Load invokes), raster upload (the earlier step that puts files in storage), bulk load (the point/polygonal counterpart)

**Raster Ingest**:
The operation that takes one Band of a *single* Cloud Optimized GeoTIFF and registers it as one Raster Layer with its footprints. One Band in, one Raster Layer out — a multiband file is ingested by one Raster Ingest per mapped Band, each carrying its own soil property. A Raster Ingest is reached only through a Raster Load: it presumes the Dataset and the File already exist and never creates either, and it never records Dataset-level metadata.
_Avoid_: Raster load (the Dataset-scoped orchestration above it), conversion (producing the COG is a separate, prior step), "ingesting a file" (a Raster Ingest consumes a Band, not a whole file)

**Raster Layer**:
The catalog record for one Band of one raster File within a Dataset, carrying that Band's soil property, depth range, reference period, resolution, nodata marker, bounding box and footprints. The raster counterpart of a DatasetLayer, and identified by the pair (File, Band) — a File and Band together have at most one Raster Layer. Unlike a Layer, a Raster Layer holds no Observations: its measurements stay in the File's pixels, which is why the File must survive the Raster Load.
_Avoid_: Layer (the soil data depth/date slice), Band (the pixel plane a Raster Layer points at), raster dataset (a Dataset, not a Raster Layer)

**Dataset File Mapping**:
The link that puts one File's declaration — a **Band Mapping** for a raster File, a column mapping for a point or polygonal one — into force for one Dataset. The declaration itself is shared and deduplicated, so the same declaration may be linked by several Files and several Datasets; the link is what is specific to the pair. A File may carry more than one Dataset File Mapping within a Dataset, of which exactly one is **Current**.
_Avoid_: Data mapping (the shared declaration the link points at — see Flagged ambiguities), "the file's mapping" bare (ambiguous between Current and Superseded), join, association

**Current** / **Superseded** (of a Dataset File Mapping):
Which of a File's Dataset File Mappings governs a load. The **Current** one is the most recently touched; every earlier one is **Superseded** — deliberately retained history, not a data defect. A Bulk Load or Raster Load reads only the Current one and never falls back to a Superseded one, so re-declaring a File's mapping changes what the next load ingests without erasing what the last load used. A property of the link alone: the same declaration can be Current for one File and Superseded for another.
_Avoid_: Active (already means an admin flag on a Raster Filter — see Flagged ambiguities), latest (says how it is found, not that it holds authority), obsolete/stale/orphaned (a Superseded mapping is intentional history), draft, version

**Band Mapping**:
The per-Band declaration of what a Band measures: its soil property, depth range, and optionally its procedure, unit conversion, reference period, prose description and Raster Layer Assets. A Raster Load ingests exactly the Bands a Band Mapping names — Bands left unmapped are not ingested, which is how uncertainty or count Bands are excluded. The raster counterpart of the column mapping used for point and polygonal Files.
_Avoid_: Column mapping (the tabular counterpart), data mapping (the shared container — see Flagged ambiguities), band metadata (what the file itself reports, not what an admin declares)

**Raster Layer Asset**:
An auxiliary File attached to one Raster Layer — a technical manual, a prediction layer, anything shipped alongside the pixels — declared per Band in the Band Mapping and identified by the pair (Raster Layer, File). Never soil data: an asset File is attached, never ingested, and nothing about it is probed or validated beyond its existence.
_Avoid_: Related Resources (the Dataset-level list of external URLs — see Flagged ambiguities), attachment, additional resource (the mapping key's name, not the entity's)

**Aggregation Unit**:
One spatial bucket that soil statistics are reported for — always exactly one **UserGeometry**. When a source file supplies the spatial scope, each geometry in that file becomes one Aggregation Unit; otherwise each UserGeometry of the **Filter** is one. Distinct from a **Feature**: an Aggregation Unit is a boundary that statistics are computed *over*, while a Feature is a sampling location whose Observations are computed *into* one. A **Feature** overlapped by two Aggregation Units belongs to both.
_Avoid_: Feature (a sampling location), AOI (the whole spatial scope, not one bucket), parcel/field/polygon (naming one use rather than the concept), subdivision piece (an internal fragment of a UserGeometry, never a reporting unit)

**Soil Statistics**:
Descriptive statistics — count, min, max, mean, median, spread, and a value histogram — computed over the **Observations** matching a **Filter**, reported per **Aggregation Unit**, **Dataset**, **Soil Property**, sampling year and depth interval. Raster **Datasets** never contribute, because their measurements are pixels rather than Observations. This is the `descriptive` **Statistics Type**, and it is not the only product computed over Aggregation Units — so "Soil Statistics" names *this* product, never whatever a soil-statistics run happens to have produced.
_Avoid_: Soil data stats (already means the ingest **Cleaning Report** — see Flagged ambiguities), summary, metrics, aggregates, "the soil-statistics output" (which Statistics Type?)

**Statistics Type** (`statistics_type`):
Which analytical product is computed over a run's **Aggregation Units**. Every type resolves the same Aggregation Units from the same **Filter**, and differs only in what it computes for them and in the shape of what it returns — so a type is a choice of *product*, never a choice of area, criteria or entitlement. `descriptive` is the default and yields **Soil Statistics**; the parameters a type does not use are rejected rather than ignored, so a type is answerable for exactly the inputs it names.
_Avoid_: Mode, algorithm, variant, "generic" (says nothing about what is computed), stat kind

**Derived Filter**:
A **Filter** created by the system rather than submitted by a user, whose UserGeometries come from a source file. It carries the criteria of the Filter it was derived from and is a fully usable Filter, but it is deliberately outside Filter **content identity**: it never deduplicates against a user's submission, and its stored raw form holds no geometries at all — the only way to read its geometries is to ask for them.
_Avoid_: System filter, temporary filter, virtual filter (it is persisted and permanent), copy (its geometries differ from the Filter it derives from)

**Band**:
One of the pixel planes of a raster file, identified by a 1-based number. The unit a Raster Ingest consumes: every Raster Layer names exactly one Band of exactly one file. Bands of a file share its resolution and geographic extent, but each carries its own values and its own nodata marker, and therefore its own footprints. Distinct from a Layer — a Band is a property of the file, not of the soil model.
_Avoid_: Layer (the soil data depth/date slice), channel, raster layer (the catalog record that points at a Band)

## Relationships

- A **Dataset** *references* one or more **Features** through its **DatasetLayers**; it does not contain them, and the same **Feature** may be referenced by several **Datasets**
- A **Feature** has one or more **DatasetLayers**
- A **DatasetLayer** links a **Feature** to a **Layer** and a **Soil Property**
- A **DatasetLayer** has one or more **Observations**
- A **Layer** carries the `sampling_date`, `min_depth`, and `max_depth` for its associated **Observations** — there is no date on **Observation** itself
- A **Filter** defines the scope for **DAI** computation; the effective **AOI** is the intersection of the Filter's geometries with the map viewport
- A **Raster Load** is scoped to one **Dataset** and performs one **Raster Ingest** per **Band** named by each raster File's **Band Mapping**; a **Bulk Load** is the equivalent for point and polygonal **Datasets**
- A **File** has one or more **Dataset File Mappings** per **Dataset** it belongs to, of which exactly one is **Current**; both loads consult only the Current one
- A **Raster Layer** belongs to one **Dataset** and names exactly one **Band** of exactly one **File**; a **File** has as many **Raster Layers** as it has mapped **Bands**
- A **Raster Layer** has zero or more **Raster Layer Assets**, each pointing at one **File**; the same **File** may be an asset of several **Raster Layers** (one per **Band** whose **Band Mapping** declares it)
- A **Filter** has a *set* of zero or more **UserGeometries** (duplicates in a submission collapse to one); each **UserGeometry** may belong to more than one **Filter**
- An **Aggregation Unit** *is* one **UserGeometry**; a **Derived Filter** has one Aggregation Unit per geometry of its source file, and equivalent geometries in that file collapse to a single Unit
- **Soil Statistics** are reported per (**Aggregation Unit**, **Dataset**, **Soil Property**) and, one level finer, per sampling year and depth interval; a **Feature** inside two Aggregation Units contributes its **Observations** to both
- A soil-statistics run has exactly one **Statistics Type** and one set of **Aggregation Units**; the Units are resolved identically for every type, and only what is computed over them differs
- An **Entitlement** grants one **Capability** over one **Dataset** to one **Subject** (or to `everyone`); a Subject's effective Entitlements are the union of its own and `everyone`'s
- A job is recorded under the **Subject** that submitted it, and resolves its Entitlements under that same Subject — so what a job may read is what its submitter may read, minus whatever only the external endpoint knows

## Example dialogue

> **Dev:** "When we compute the DAI, do we count observations or layers for the date signal?"
> **Domain expert:** "Layers — an observation has no date of its own. The sampling date lives on the layer, so we count distinct layers with a non-null date."

> **Dev:** "If a filter has no geometries, what's the AOI?"
> **Domain expert:** "The viewport bounding box is the AOI. Geometries clip the bbox; without them, the whole viewport is in scope."

> **Dev:** "Two of my fields overlap, and there's one sampling point in the overlap. Does it count once or twice?"
> **Domain expert:** "Twice — once in each **Aggregation Unit**. 'Mean pH in this field' has to be the mean pH in that field, whatever else it overlaps. But the `overall` figure counts that **Observation** once, so don't expect the per-unit counts to add up to it."

**Preprocessing Steps** (`preprocessing_steps`):
An optional free-text field on a Dataset that documents the data cleaning and transformation steps applied to the raw source data prior to ingestion. Set by data admins; not computed by the system.
_Avoid_: Processing instructions, pipeline steps, ETL steps

**Related Resources** (`related_resources`):
An optional list of external URLs associated with a Dataset (e.g. publications, source repositories, data provider pages). Set by data admins; not computed by the system. Distinct from a Raster Layer Asset, which is a File attached to one Raster Layer rather than a URL recorded on a Dataset.
_Avoid_: Links, references, attachments, additional resources (the Band Mapping key that declares Raster Layer Assets)

## Flagged ambiguities

- The UI's **"Data access"** filter (options "Private"/"Public") filters by **Visibility** — the entitlement-agnostic Dataset attribute. Selecting "Private" means "datasets whose visibility is private", never "datasets I have access to". Likewise the UI's **"Data type"** filter maps to the `data_types` criterion (`gis_datatype`). In domain discussions prefer **Visibility** and **data type**; "access" is a UI label only.

- **"ID" almost never means the primary key** — see **Public identifier**. "dataset ID" means the Dataset's `slug`: `GET /data-filters/{filterId}/datasets` returns the slug in the `id` field, and the `datasets` query parameter of `GET /soil-data` matches against slugs. The same holds inside a Band Mapping: an additional resource's `file_id` is a **File slug**, resolved through slug history, so a File renamed after the mapping was written still resolves. In domain discussions, say **slug** when you mean the public identifier and reserve "primary key" for the internal UUID — never bare "ID" for either.
- "layer" was used in the codebase to mean both the domain entity (depth/date slice) and Mapbox/map rendering layers — in domain discussions, **Layer** always refers to the soil data entity.
- "observation" was initially used loosely to mean any data point or measurement; resolved: **Observation** is specifically a row in the `observations` table with a numeric `value`, linked to a **DatasetLayer**.
- A **null** parameter criterion and an **absent** one mean different things and yield different Filters: `min_depth: null` means "match Layers with no recorded depth", while omitting `min_depth` means "no depth constraint" (same for `max_depth` and the sampling-date criteria). Never normalise null to absent (or vice versa) when comparing filter criteria.
- **A File with no metadata is not a category.** Absent metadata means one of three unrelated things: a **Non-spatial File** (never probed), a File created by the raster ingestion CLI (which describes the raster by other means), or a test fixture. Never treat "has no metadata" as a way to identify Non-spatial Files — the distinction is known to whoever uploaded the File, not recoverable from the File itself.
- **A data mapping means two different things depending on the Dataset's Data Type.** For a point or polygonal File its entries are *column references* — "the column named X supplies the sampling date". For a raster File its entries are a **Band Mapping**: keyed by Band number, and the values are *literal values* rather than references, because a Band has no columns to point at. The container is shared; the meaning is not. In domain discussions say **column mapping** or **Band Mapping**, never bare "mapping".

- **Features and Layers are shared, not owned** — and the glossary previously said otherwise ("a sampling location *within a Dataset*", "a depth/date slice *within a Feature*"). Both are identified purely by their own content, so two Datasets sampling the same place, or the same depth/date slice, reference the *same* row rather than each getting a copy. Consequences worth stating out loud: nothing can be attributed to a Dataset by looking at a Feature or a Layer alone — only a **DatasetLayer** carries that; and a count of distinct Features is a count of *places*, so it is only per-Dataset if the count is taken within one Dataset.

- **"sub" was used to mean both the token claim and the Subject** — and the two are different strings whenever a token carries an email. Resolved: the **Subject** is what Entitlements and `created_by` are keyed by; `sub` is one claim that only *sometimes* supplies it. The confusion was load-bearing, not cosmetic: the request path resolved Entitlements by email while the job path resolved them by `sub`, so a job saw only `everyone`'s Entitlements and silently skipped private Datasets its submitter was entitled to. Say **Subject** in domain discussions and reserve `sub` for the JWT claim.

- **"Coverage" names two unrelated things.** The **Coverage map** is the DAI heat layer. But `GET /data-filters/{filterId}/coverage` returns neither a map nor a DAI: it answers "which **Datasets** have data matching this **Filter**, and which raster values occur in its AOI". When someone says "the same filtering as coverage" they mean that endpoint's criteria handling, not the DAI's. In domain discussions say **Coverage map** for the picture, **DAI** for the score, and **data availability** for what the coverage endpoint reports.

- **"Soil data stats" is already taken, and it is not statistics.** `GET /datasets/{id}/dataset-file-mapping/{id}/soil-data/stats` (handler `getSoilDataStats`) returns a **Cleaning Report** — how many raw cells and rows were rejected or altered during ingestion. Scientific statistics over **Observations** are **Soil Statistics** (job type `soil-statistics`). The two share no data, no consumer and no code. Never say "soil data stats" for either; say **Cleaning Report** or **Soil Statistics**.

- **"Statistics" now names three things, and the job queue is the loosest of them.** Beyond the **Cleaning Report** confusion above, the `soil-statistics` job queue is no longer synonymous with **Soil Statistics**: it dispatches on **Statistics Type**, and only `descriptive` produces Soil Statistics. So "the statistics job" is a queue, "Soil Statistics" is one of its products, and "soil data stats" is neither. Name the **Statistics Type** whenever the product matters; a request to "run the statistics" is under-specified.

- **`related_resources` and `additional_resources` are unrelated.** `related_resources` is a Dataset column holding external URLs; `additional_resources` is a Band Mapping key declaring that Band's **Raster Layer Assets**, which are Files. The near-identical names are the only thing they share. In domain discussions say **Related Resources** for the Dataset's URLs and **Raster Layer Asset** for an attached File — never "resources" bare.

- The Dataset field holding its soil properties is called **`measured_properties`** in code but stored in a column named `variables_measured` (an older name, retained). They are one field, not two. Prefer **measured properties** in discussion.

- "active" is used in two unrelated senses in the raster filtering code: the persisted `active` column on `raster_filters` (admin-controlled catalog availability — see **Raster Filter**), and query-time variables/comments like `hasActiveFilters` in `FilteringMasks.ts` (whether the current Filter's `raster_filters` criterion has non-empty selected values for a given raster table). Toggling a Raster Filter's `active` flag has no effect on the query-time check, and vice versa. In domain discussions, say "active Raster Filter" for the catalog flag and "selected raster filter values" for the query-time notion.
