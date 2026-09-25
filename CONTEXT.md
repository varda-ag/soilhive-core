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
The identity a caller acts under, and what **Entitlements** are keyed by and every `created_by`/`updated_by` record holds — a job's included, so a job resolves the same Entitlements its submitter had. For a person it is the token's `email` claim, else its `sub`; for a **Machine caller** it is the client the caller authenticated as, and an email is never consulted even if one is present. Not a synonym for the token's `sub` claim, which is only a fallback and in general is a different string. Which branch supplies a person's Subject is a property of the deployment's identity provider rather than of the caller: on a deployment whose IdP omits `email` from access tokens, *no* person's Subject is ever an email address, and every **Entitlement** granted to one is unreachable.
_Avoid_: sub, user, user id, owner, caller (the requester; the Subject is the resolved value it acts under)

**Machine caller**:
A caller acting as itself, with no person behind it — it authenticated *as a client* rather than logging in as a user. Its **Subject** is the client it authenticated as, never an email, and it is a property of how the token was obtained rather than of who holds it: the same client can back both a **Machine caller** and an interactive login. A caller whose kind cannot be established is treated as a person, so two people are never merged into one Subject by mistake — the cost being that a Machine caller the platform cannot recognise falls back to an opaque Subject and loses grants made to its client.
_Avoid_: Service account (the identity provider's own record for it), bot, API user, client (overloaded — the interactive app is also a client), **Privileged caller** (an unrelated axis: privilege comes from scopes, and a Machine caller is not privileged by being one)

**Entitlement**:
A **Capability** (`preview`, `download`, `obfuscate_as_points`, `obfuscate_as_polygons`, `read`, `write`) granted to one **Subject** or to `everyone`, over one of two scopes: a Dataset, or a config item (`PUT /config/{configId}`, keyed by its freeform id rather than a slug). Consulted only for private Datasets — a public Dataset needs none; a config item has no Visibility and is always consulted. Datasets draw from two independent sources: rows held locally, and an external entitlements endpoint reachable only while the caller's raw token exists — config items are local-only, the external endpoint has no notion of them. Entitlements are the access axis; **Visibility** is the attribute axis (Datasets only), and neither substitutes for the other. A non-admin caller may self-claim `write` on a plugin-owned (`plugin:{pluginId}:{id}`) config item's own Entitlements the first time it is accessed — never on a Dataset's (see ADR 0035). A Dataset Entitlement's lifetime is bound to the Dataset's *data*, not its record: it survives an **Archive** and is destroyed by a **Purge**, and only the locally held rows are, since the external endpoint's answers are outside the system's reach.
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
_Avoid_: Raster load (the Dataset-scoped orchestration above it), conversion or normalization (a Raster Load step: a deviating file is normalized once, before any of its Bands is ingested — ADR 0025), "ingesting a file" (a Raster Ingest consumes a Band, not a whole file)

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
Count, extremes, mean, spread, percentiles (p05–p95) and **Outliers** of one variable's values (a **Soil Property**'s Observations or a **Soil Index** **Run**'s scores), with no histogram, reported per **Aggregation Unit**, **Dataset**, **Year Window** and depth bucket, like a **Class Distribution**. Raster **Datasets** never contribute, because their measurements are pixels rather than Observations. This is the `descriptive` **Statistics Type**, and it is not the only product computed over Aggregation Units — so "Soil Statistics" names *this* product, never whatever a **Run** happens to have produced. It is a *payload*, not a record: what persists it is the **Data Request** the Run answers.
_Avoid_: Soil data stats (already means the ingest **Cleaning Report** — see Flagged ambiguities), summary, metrics, aggregates, **Data Request** (the record that carries this payload, and carries the other Statistics Types too), "the data-requests output" (which Statistics Type?)

**Outlier**:
A value beyond the Tukey fences of its row: below p25 - 1.5·IQR or above p75 + 1.5·IQR. Counted, never dropped; the whiskers are the most extreme values inside the fences.
_Avoid_: Anomaly, error (an outlier may be a real measurement), extreme (the min and max)

**Class**:
A named numeric interval `[min, max)` that a **Class Distribution** sorts values into, supplied by the caller or generated by a **Class Method**. Classes belong to one request, never overlap and may be open-ended; a value in no Class is **unclassified** and still counts toward the whole.
_Avoid_: Bin (a histogram term; a Class is named and may be open-ended), category, range, bucket, texture class (one use, not the concept)

**Class Method** (`class_method`):
How Classes are generated when the caller gives only their number: `equal-interval` (equal widths over the 1st–99th percentile range, open end Classes beyond) or `quantile` (about equal counts per Class). Generated once per request from every Observation counted once; equal edges merge, so fewer Classes than asked may come back.
_Avoid_: Optimal classes (optimal for which chart?), binning, auto-classes, classification scheme

**Class Distribution**:
The share or number of a variable's values in each **Class**, per **Aggregation Unit**, **Dataset**, **Year Window** and depth bucket: the `class-distribution` **Statistics Type**. The variable is a **Soil Property**'s Observations (counted, not weighted by **Feature** or area) or one **Soil Index** **Run**'s scores, each belonging to the units containing its representative point.
_Avoid_: Histogram (system-chosen bins, not caller-named Classes), classification, breakdown, variable distribution ("variable" is the parameter's name, not a domain term)

**Year Window**:
N consecutive sampling years aligned to multiples of N (for N = 3: 2016–2018, 2019–2021), so a year always falls in the same window. Observations with no recorded year get their own bucket. `time_aggregation: "none"` pools every year, the no-year bucket included, into one.
_Avoid_: Period, epoch, time bucket, time aggregation (the parameter that sets N, not the window)

**Standard Depth Range**:
One of the GlobalSoilMap ranges (0–5, 5–15, 15–30, 30–60, 60–100, 100–200 cm, deeper than 200). An Observation belongs to the one range holding its Layer's depth midpoint, so a 0–30 cm composite is reported at 15–30 cm.
_Avoid_: Depth interval (a Layer's own `min_depth`–`max_depth`), horizon (a pedological layer, not a fixed range), depth bucket, depth aggregation

**Value Range**:
How many values of one variable match, at how many **Features**, and their lowest and highest: the `value-range` **Statistics Type**. Reported request-wide across all years (each value counted once), per **Year Window**, and per **Dataset** and Year Window; over a **Soil Index** **Run**'s scores, without Datasets.
_Avoid_: Summary (already an alias for **Soil Statistics**), extent (spatial), bounds, stats

**Statistics Type** (`statistics_type`):
Which analytical product is computed over a run's **Aggregation Units**. Every type resolves the same Aggregation Units from the same **Filter**, and differs only in what it computes for them and in the shape of what it returns — so a type is a choice of *product*, never a choice of area, criteria or entitlement. `descriptive` yields **Soil Statistics**, `class-distribution` a **Class Distribution** and `value-range` a **Value Range**; the parameters a type does not use are rejected rather than ignored, so a type is answerable for exactly the inputs it names. Always named explicitly and never defaulted, as a **Soil Index** type is — a Run that could not say which product it computed would be answerable for nothing. A **Soil Index** is *not* a Statistics Type — it is the same kind of choice made on a different queue, for a reason that is operational rather than conceptual (see ADR 0036).
_Avoid_: Mode, algorithm, variant, "generic" (says nothing about what is computed), stat kind

**Soil Index**:
A single score computed from soil data for one **Aggregation Unit** by a named methodology — the CREA index is one — attached to the **Run** that produced it and held as a scored geometry rather than as a payload. Choosing a methodology is never a choice of area, criteria or entitlement, exactly as with a **Statistics Type**: the **Aggregation Units** are resolved identically either way, and only the score differs. Not the **DAI**, which is also an index but scores how much *data* covers a cell rather than what the soil there is like.
_Avoid_: Index bare (the **DAI**, an H3 index and a Postgres index all answer to it), score/rating (says nothing about what is scored), **Soil Statistics** (a distribution summary over **Observations**, not a single value), metric, "the crea index" for the concept (that is one methodology, not the family)

**Run**:
One execution of a job that resolves **Aggregation Units** and computes something over them — a `data-requests` job or a `soil-indexes` one — identified by that job's id. A Run has exactly one set of Aggregation Units and exactly one product: either a **Statistics Type** or a **Soil Index**, never both, and it is the unit that results are attributed to and discarded by: two Runs of an identical request are two Runs, and neither supersedes the other. A Run's id outlives the job record it came from, so a Run may be readable long after there is anything left to ask about its progress. A **Soil Index** Run's id is also the whole permission to read its scores (docs/adr/0039).
_Avoid_: Job (the queue record, which is deleted on retention while the Run's results are not), request, execution, batch, "the statistics" (which Run, which **Statistics Type**?), "the data-requests run" (a Run may come from either queue)

**Derived Filter**:
A **Filter** created by the system rather than submitted by a user, whose UserGeometries come from a source file. It carries the criteria of the Filter it was derived from and is a fully usable Filter, but it is deliberately outside Filter **content identity**: it never deduplicates against a user's submission, and its stored raw form holds no geometries at all — the only way to read its geometries is to ask for them.
_Avoid_: System filter, temporary filter, virtual filter (it is persisted and permanent), copy (its geometries differ from the Filter it derives from)

**Data Request**:
One request and the outcome its **Run** reached, kept together so the outcome survives the disappearance of the Run that produced it. Both outcomes are recorded: an answer, or the reason there is none — a Data Request therefore says what happened, not only what was computed, and a Run that was cancelled leaves none at all, because cancelling is how a Data Request is destroyed. It is what a `data-requests` **Run** exists to produce: the answer computed — **Soil Statistics** for the `descriptive` **Statistics Type** — is the `data` half of one Data Request, which is why that queue is named for the record rather than for any one product; a failed Run fills the other half instead, and has no `data`. A **Soil Index** is *not* a Data Request and never becomes one: its scores are held as scored geometry attached to their own **Run**, because a Soil Index Run's output grows with the **Aggregation Unit** count and would breach the payload ceiling a Data Request lives under (docs/adr/0021). A Data Request is identified by the id of the **Run** that produced it, so a single identifier addresses the answer for its whole life — the job record while it survives, the Data Request afterwards. Distinct from a **Filter** in every direction: a Filter is a reusable, owned, deduplicated *scope* that queries are run against, while a Data Request is a single historical fact that is never reused and belongs to nobody. It has no owner at all. Unless it is **attached**, possession of its identifier is the whole of the permission both to read it and to destroy it, so passing that identifier on is passing on the data and the power to erase it. An attached Data Request is bound at submission to one plugin config item, which governs it without owning it: reading it takes `read` on that item, destroying it takes `write`, and it is destroyed with the item.
_Avoid_: Filter (a persisted scope, deduplicated per owner), query, job (the queue record that computes an answer, not the record of one), **Soil Statistics** (one Statistics Type's payload, not the record carrying it), **Soil Index** (a Run's product, held as scored geometry and never a Data Request), cache entry (an identical request is never answered from an earlier one), export

**Export**:
One execution of a download request: a **Filter** and a set of **Datasets** resolved into files in the caller's chosen formats. Identified by the id of the job that runs it, and the unit that progress, failure and the size limit are all attributed to — so "the Export is too large" is always a statement about how many **Observations** it names, never about how big its files turned out. Two Exports of an identical request are two Exports, and neither supersedes the other.
_Avoid_: Download (the act of retrieving the **Export Bundle**, not of producing it), **Data Request** (a historical answer that is never recomputed — an Export is recomputed every time it is asked for), report, extract, query

**Export Bundle**:
The single ZIP an **Export** produces: a readme PDF, one file or worksheet per **Soil Property**, and one folder per exported **Raster Layer**. It is the artifact, never the request — its size is measured in bytes and its shape depends on the chosen formats, while the Export that produced it is measured in **Observations**. An Export that fails produces no Export Bundle at all; there is no partial one.
_Avoid_: **Export** (the execution that produces it), the ZIP/the archive (names the container, and "archive" already means the reversible retirement of a **Dataset**), the download, output files

**Ingestion Status**:
The lifecycle stage of a Dataset — `PENDING`, `ONGOING`, `STAGED`, `LOADED`, `PUBLISHED`, `ARCHIVED` — recording how far its data has progressed through ingestion. A catalog/lifecycle attribute, **not** an access axis: it says whether a Dataset is offered in the catalog, never what a caller may do with its data. Access is governed by **Visibility** and **Entitlement** alone.
_Avoid_: State, stage, publication state, visibility (the access attribute), "active"/"live" (already taken — see Flagged ambiguities)

**Published**:
The Ingestion Status a Dataset must hold to be **listed** — to appear in the catalog and in every filter, coverage and DAI result. It is not a release of the data: a Dataset's soil data is readable through `/soil-data` by anyone holding its slug at any Ingestion Status, subject only to **Visibility** and **Entitlement**. Say "listed", never "released".
_Avoid_: Live, public (that is a **Visibility** value), released, available, approved

**Privileged caller**:
A caller acting under an internal-request, data-admin or super-admin token scope — the single notion of privilege in the system, bypassing both the **Entitlement** checks and the **Published** requirement. Not an **Entitlement** and not a **Subject** attribute: privilege comes from the token's scopes, while Entitlements are keyed by Subject.
_Avoid_: Admin (ambiguous across the three scopes, and "data admin" also names the human role that curates Datasets), role, superuser, owner

**Archive**:
The reversible retirement of a Dataset: it stops appearing in every query, but all of its soil data, **Raster Layers** and **Entitlements** remain intact. A Dataset can be un-archived and be exactly what it was — which is why an Archive destroys nothing, and why a failed **Purge** falls back to one.
_Avoid_: Delete (says nothing about reversibility — see Flagged ambiguities), soft delete (a mechanism), deactivate, retire

**Purge**:
The irreversible destruction of one Dataset's data: its **DatasetLayers** or **Raster Layers** and their **Observations**, every **Feature** and **Layer** no longer referenced by any other Dataset, and every locally held **Entitlement** to it. Always preceded by an **Archive**, and if the Purge fails the Archive is undone — so a Dataset is either wholly present or wholly gone, never half-purged. The Dataset's own record and its slug history survive a Purge, so its slugs are never reissued.
_Avoid_: Bulk delete (the job queue that performs it — see Flagged ambiguities), hard delete (a mechanism), bulk load's counterpart (Bulk Load is named for what it consumes; a Purge is scoped to a Dataset), wipe

**Band**:
One of the pixel planes of a raster file, identified by a 1-based number. The unit a Raster Ingest consumes: every Raster Layer names exactly one Band of exactly one file. Bands of a file share its resolution and geographic extent, but each carries its own values and its own nodata marker, and therefore its own footprints. Distinct from a Layer — a Band is a property of the file, not of the soil model.
_Avoid_: Layer (the soil data depth/date slice), channel, raster layer (the catalog record that points at a Band)

**Band Statistics**:
The summary of one **Band**'s own pixel values — minimum, maximum, mean, standard deviation and the share of valid pixels — carried inside the raster file that holds those pixels rather than in any database record. Describes exactly the pixels of the file it travels in, so the same Band summarised over a different extent has different Band Statistics. Never soil data and never derived from **Observations**: a raster **Dataset** has Band Statistics and no **Soil Statistics**, and the two are never compared. Carried by every Band regardless of what it measures, so a categorical Band has them too — there its extremes are the class codes present and its mean is arithmetic over codes, meaningful to no one.
_Avoid_: Pixel statistics (they summarise a Band, not individual pixels), raster statistics (says nothing about the per-Band grain), **Soil Statistics** (computed over Observations per Aggregation Unit — see Flagged ambiguities), min/max (two of the five members, often meant for the whole file)

**Plugin**:
An externally hosted module-federation remote that the frontend loads at runtime into a page, a new tab, or the map's info card. Has two distinct, unrelated contract halves: the data the host feeds *into* the Plugin (its **Plugin Context**), and the metadata the Plugin exposes *back* to the host describing how to mount it (a **Remote Plugin**). Never assume "plugin" alone disambiguates which half is meant.
_Avoid_: Module, remote, extension (all name one aspect — the file, the transport mechanism, the capability — not the concept as a whole)

**Plugin Context** (`PluginContext`):
The data and host-injected query hooks a Plugin receives as its one prop: map selection, theme, and hooks for filters, coverage, soil properties, soil data, and **Data Requests**. Defined in `frontend-plugin-types`, decoupled from the host's own domain types. The host-to-Plugin half of the contract.
_Avoid_: Plugin props, context (too generic — always say "Plugin Context")

**Remote Plugin** (`RemotePlugin`):
The metadata a Plugin exposes describing how the host should mount it: its `PluginType` (`single-page`, `new-tab`, or `map-info-card`), whether it gets a menu item, its route, and its `Page` component. Defined in the host's `src/types/plugins.ts`, not in `frontend-plugin-types`. The Plugin-to-host half of the contract — the mirror image of Plugin Context, not an overlapping concept.
_Avoid_: Plugin (too generic when the mounting metadata specifically is meant), plugin config

## Relationships

- An **Export** *is scoped by* exactly one **Filter** and one or more **Datasets**, and *produces* at most one **Export Bundle**
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
- A data-requests run has exactly one **Statistics Type** and one set of **Aggregation Units**; the Units are resolved identically for every type, and only what is computed over them differs
- A **Class Distribution** is computed for one variable, which narrows within the **Filter**'s criteria and never widens them; over a **Soil Index** Run's scores the Filter must carry no criteria
- A **Run** computes either one **Statistics Type** or one **Soil Index**, never both; either way it resolves its **Aggregation Units** from one **Filter** and at most one source file, and scores or summarises exactly those Units
- An **Entitlement** grants one **Capability** over one **Dataset** or config item to one **Subject** (or to `everyone`); a Subject's effective Entitlements are the union of its own and `everyone`'s
- Every caller is either a person or a **Machine caller**, and the kind decides which claim supplies its **Subject**; the kind is independent of whether the caller is **Privileged**, and a caller of unknown kind is treated as a person
- A non-admin **Subject** may self-claim `write` on a plugin-owned config item's own Entitlements the first time it is accessed, granting only itself; every other Entitlement write requires an existing `write` grant or a **Privileged caller** (see ADR 0035)
- A **Purge** is preceded by exactly one **Archive** and destroys every locally held **Entitlement** to the Dataset; an **Archive** on its own destroys none
- A job is recorded under the **Subject** that submitted it, and resolves its Entitlements under that same Subject — so what a job may read is what its submitter may read, minus whatever only the external endpoint knows
- A **Plugin** receives exactly one **Plugin Context** (host → Plugin) and exposes exactly one **Remote Plugin** (Plugin → host); neither implies the other
- A **Data Request** is attached to at most one plugin config item, fixed at submission, which must already exist; a **Plugin** only ever submits attached Data Requests, and decides itself when each one is destroyed
- Every Dataset has exactly one **Ingestion Status**; only a **Published** one is listed, and only a **Privileged caller** is shown the rest
- An **Archive** both sets the Ingestion Status to `ARCHIVED` and removes the Dataset from every query — so no caller, **Privileged** or not, ever sees an archived Dataset
- **Ingestion Status**, **Visibility** and **Entitlement** are three independent attributes of a Dataset: the first decides whether it is listed, the other two decide what may be done with its data

## Example dialogue

> **Dev:** "When we compute the DAI, do we count observations or layers for the date signal?"
> **Domain expert:** "Layers — an observation has no date of its own. The sampling date lives on the layer, so we count distinct layers with a non-null date."

> **Dev:** "If a filter has no geometries, what's the AOI?"
> **Domain expert:** "The viewport bounding box is the AOI. Geometries clip the bbox; without them, the whole viewport is in scope."

> **Dev:** "An admin deletes a private **Dataset**. Do the people who were entitled to download it lose that?"
> **Domain expert:** "Depends which delete. An **Archive** changes nothing — the **Entitlements** are still there, because the data is still there and we might bring it back. A **Purge** takes them with it: once the **Observations** are gone there is nothing left to be entitled to. And only ours — if the external endpoint still hands out `download` for that Dataset, that is its business, not ours."

> **Dev:** "A **Dataset** is sitting at `LOADED` because the pH column was mis-mapped. Nobody outside can get at it, right?"
> **Domain expert:** "Nobody can *find* it — it is not **Published**, so it is not in the catalog and not in any filter or coverage result. But **Published** only governs listing. Anyone who has the slug can still pull the **Observations**, because that path answers to **Visibility** and **Entitlement** and those say nothing about status. If the Dataset is `public`, the bad pH is one URL away. Fix the mapping or make it `private` — do not rely on it being unpublished."

> **Dev:** "Two of my fields overlap, and there's one sampling point in the overlap. Does it count once or twice?"
> **Domain expert:** "Twice — once in each **Aggregation Unit**. 'Mean pH in this field' has to be the mean pH in that field, whatever else it overlaps. But the `overall` figure counts that **Observation** once, so don't expect the per-unit counts to add up to it."

> **Dev:** "The farm only sampled 0–30 cm, so why is there nothing at 0–5 or 5–15?"
> **Domain expert:** "A 0–30 composite's midpoint is 15, so it lands in 15–30. The row's `depth_min`/`depth_max` of 0–30 show it's a composite."

> **Dev:** "My three pH **Classes** add up to 94%. Where's the rest?"
> **Domain expert:** "In `unclassified`: values outside every Class. It counts toward the whole, so a field whose values mostly miss your Classes doesn't look like one where none do."

**Preprocessing Steps** (`preprocessing_steps`):
An optional free-text field on a Dataset that documents the data cleaning and transformation steps applied to the raw source data prior to ingestion. Set by data admins; not computed by the system.
_Avoid_: Processing instructions, pipeline steps, ETL steps

**Related Resources** (`related_resources`):
An optional list of external URLs associated with a Dataset (e.g. publications, source repositories, data provider pages). Set by data admins; not computed by the system. Distinct from a Raster Layer Asset, which is a File attached to one Raster Layer rather than a URL recorded on a Dataset.
_Avoid_: Links, references, attachments, additional resources (the Band Mapping key that declares Raster Layer Assets)

## Flagged ambiguities

- **"Published" was used to mean both "listed in the catalog" and "the data is released."** Resolved: it means **listed only**. Every dataset-listing path pins `status = 'PUBLISHED'`, but `/soil-data` deliberately does not — an unpublished Dataset's Observations are readable by anyone holding its slug, gated by **Visibility** and **Entitlement** and nothing else. So "unpublished datasets aren't visible" is true of the catalog and false of the data. Always say *where*.
- **"Admin" names three different token scopes and one human role.** `internal-request`, `data-admin` and `super-admin` are collapsed into one **Privileged caller** predicate for both the Entitlement bypass and the **Published** requirement; "data admin" in prose elsewhere in this glossary means the *person* curating Datasets, not the scope. Say **Privileged caller** for the predicate and name the scope explicitly when the distinction matters.

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

- **"Soil data stats" is already taken, and it is not statistics.** `GET /datasets/{id}/dataset-file-mapping/{id}/soil-data/stats` (handler `getSoilDataStats`) returns a **Cleaning Report** — how many raw cells and rows were rejected or altered during ingestion. Scientific statistics over **Observations** are **Soil Statistics**, computed by the `data-requests` job. The two share no data, no consumer and no code. Never say "soil data stats" for either; say **Cleaning Report** or **Soil Statistics**.

- **"Request" is three things, and only one of them is a **Data Request**.** A **Data Request** is the persisted record of an answer already given — and the `data-requests` job queue is named for it, so queue and record mean the same concept on purpose. The `request` a caller makes to the API is an HTTP call and persists nothing. And what a **Filter** holds — AOI geometries plus criteria — is a *scope*, which people habitually call "the request" because it is what they typed. The three differ on ownership and reuse, which is exactly what matters: a Filter is owned and deduplicated per owner, a Data Request is owned by nobody and deduplicated never. Say **Data Request** for the record (or for the queue that writes it), **Filter** for the scope, and name the endpoint for the call.

- **"Statistics" names three things, and the job queue is no longer one of them.** The queue that computes them is `data-requests`, named for the **Data Request** it writes rather than for any product, because it dispatches on **Statistics Type** and only `descriptive` yields **Soil Statistics** — so "the statistics job" now names nothing, and the thing to say is **Data Request** for the record, the **Statistics Type** for the product. The three that remain: **Soil Statistics** (over **Observations**, per **Aggregation Unit**); the **Cleaning Report**, which `getSoilDataStats` confusingly calls "soil data stats" and which is an ingest tally, not statistics; and **Band Statistics**, which shares nothing with either — it summarises the pixels of one **Band** inside a raster file, is written by GDAL rather than computed by any job, and never reaches the soil tables. A request to "run the statistics" is still under-specified: name the Statistics Type.

- **"Index" names four things, and only one of them is a **Soil Index**.** The **DAI** is an index, and it is computed by `refresh-dai-stats` — never by the `soil-indexes` queue, because it scores how much *data* covers a cell rather than what the soil there is like. An **H3 index** is a grid cell identifier. A Postgres index is infrastructure and not a domain term at all. A **Soil Index** is a score computed from soil data for one **Aggregation Unit** by a named methodology. The queue is `soil-indexes` and not `indexes` precisely so the DAI's absence from it needs no footnote. Never say "the index job": say **Soil Index** and name the methodology (the CREA index is one), or say **DAI**.

- **`related_resources` and `additional_resources` are unrelated.** `related_resources` is a Dataset column holding external URLs; `additional_resources` is a Band Mapping key declaring that Band's **Raster Layer Assets**, which are Files. The near-identical names are the only thing they share. In domain discussions say **Related Resources** for the Dataset's URLs and **Raster Layer Asset** for an attached File — never "resources" bare.

- The Dataset field holding its soil properties is called **`measured_properties`** in code but stored in a column named `variables_measured` (an older name, retained). They are one field, not two. Prefer **measured properties** in discussion.

- **"Delete a Dataset" is never a single operation, and the code's names invert the distinction.** `DatasetService.deleteDataset` performs an **Archive**, not a delete; the **Purge** is the `bulk-delete` job, whose first step is to call `deleteDataset`. So "we do X on delete" is always under-specified — an Archive keeps everything and can be undone, a Purge destroys soil data and **Entitlements** and cannot. Say **Archive** or **Purge**; reserve "bulk-delete" for the queue, never for the concept. Note also that the published `DELETE /datasets/{id}` endpoint is an Archive alone: it reaches no Purge, so a Dataset deleted through it keeps all of its data and Entitlements.

- `docs/frontend/module-federation.md` describes Plugin loading as a hardcoded, top-level-await `loadRemotesConfig()` and registration by `path`. The actual code (`src/utilities/moduleFederation.ts`, `src/contexts/RemotesContext.tsx`) loads Plugins on demand via `loadRemotes(configs)`, sourced from the backend-driven `themeConfig.plugins`, and registers by `route` — the doc is stale. `frontend/remotes.json` is dead leftover configuration from before this change (unreferenced by any code, and its port doesn't match the example Plugin's actual dev port) — do not treat it as a source of truth for anything.

- "active" is used in two unrelated senses in the raster filtering code: the persisted `active` column on `raster_filters` (admin-controlled catalog availability — see **Raster Filter**), and query-time variables/comments like `hasActiveFilters` in `FilteringMasks.ts` (whether the current Filter's `raster_filters` criterion has non-empty selected values for a given raster table). Toggling a Raster Filter's `active` flag has no effect on the query-time check, and vice versa. In domain discussions, say "active Raster Filter" for the catalog flag and "selected raster filter values" for the query-time notion.
