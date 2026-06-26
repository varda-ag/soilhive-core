# Infrastructure Requirements

## Deployment Model

SoilHive Open Source is a Node.js and React based application connected to a PostgreSQL/PostGIS database.

The recommended deployment model is a Docker based deployment running the SoilHive **backend and frontend containers** alongside a PostgreSQL/PostGIS database.

For **pilot** and **small production** environments, the **application containers** and PostgreSQL database can run on the same server, simplifying deployment and operations.

For **medium** and **large production** environments, PostgreSQL/PostGIS should run on a dedicated server, as the database is the primary performance sensitive component of the system and is responsible for geospatial queries, indexing, ingestion, and export workloads.

SoilHive does not require public cloud infrastructure and can run in government data centres, virtual machines, or bare metal Linux servers.

---

## Application Containers

SoilHive is composed of two application containers:

| Container | Role | Exposes |
|---|---|---|
| **backend** | Node.js API server — handles data access, geospatial queries, ingestion, and export | Port 3000 (internal) |
| **frontend** | React SSR server (Express + React) — serves the web UI | Port 80 (external) |

Both containers are lightweight and not the primary driver of infrastructure sizing. The PostgreSQL/PostGIS database is the dominant resource consumer. See *Why PostgreSQL/PostGIS Drives Sizing* below.

---

## Infrastructure Profiles

The following profiles provide recommended starting points for provisioning infrastructure.

Actual requirements will depend on dataset size, ingestion frequency, user concurrency, and export workloads.

| Profile | Deployment Layout | CPU | RAM | Storage¹ | Typical Use |
|---|---|---:|---:|---:|---|
| **Pilot** | 1 server running SoilHive (backend + frontend) + PostgreSQL | 4 cores | 16 GB | 250 GB SSD | Evaluation, demos, training |
| **Small Production** | 1 server running SoilHive (backend + frontend) + PostgreSQL | 8 cores | 32 GB | 500 GB to 1 TB SSD | Initial institutional deployment |
| **Medium Production** | 1 SoilHive server (backend + frontend) + 1 PostgreSQL server | App: 4 cores<br>DB: 8 cores | App: 16 GB<br>DB: 32 GB | App: 250 GB SSD<br>DB: 1 TB SSD | Operational deployment with multiple datasets |
| **Large Production** | Dedicated application (backend + frontend), database and storage servers | App: 8+ cores<br>DB: 16+ cores | App: 32 GB<br>DB: 64+ GB | App: 250 GB SSD<br>DB: 2+ TB SSD | Large scale or national deployments |

> ¹ App storage figures cover OS and application runtime only. Raster file storage is additional — see *Application Storage Sizing* below.

---

## Why PostgreSQL/PostGIS Drives Sizing

The main infrastructure demand in SoilHive comes from the PostgreSQL/PostGIS database rather than the frontend or API layer.

PostgreSQL/PostGIS is responsible for:

* Geospatial queries and filtering
* Spatial indexing
* Dataset ingestion
* Export generation
* Metadata and configuration storage

Spatial workloads are typically sensitive to:

* Available RAM for caching and indexing
* CPU for concurrent queries and processing
* SSD backed storage for low latency disk I/O

For this reason, larger deployments benefit from separating the database from the application layer.

---

## Minimum PostgreSQL/PostGIS Requirements

The following represent the minimum supported database requirements for SoilHive.

| Component | Requirement |
|---|---|
| PostgreSQL | **Version 18 (required)** |
| Extensions | PostGIS, postgis_raster, unaccent |
| CPU | 4 cores minimum |
| RAM | 8 GB minimum |
| Storage | SSD required |
| Database Storage | 100 GB minimum. See *Database Storage Sizing* below. |
| Spatial Indexing | GiST indexes enabled where applicable |
| Backups | Daily database backups recommended |

> **Why PostgreSQL 18?** SoilHive relies on PostgreSQL 18, including native UUID version 7 support, to generate time ordered identifiers that improve ingestion performance and index locality.

---

## Database Storage Sizing

The following benchmarks were measured from real ingestion runs of vector soil observation data. Each observation includes record level licence, sampling date, depth interval, and one procedure per soil property.

| State | Observations | Soil Properties | Database Size |
|---|---:|---:|---:|
| Base (vocabulary and schema only) | 0 | — | ~1.5 MB |
| After first ingestion | ~150,000 | 12 | ~88 MB |
| After second ingestion | ~300,000 | 12–13 | ~229 MB |

**Rule of thumb:** approximately **60 MB per 100,000 vector soil observations** before operational overhead.

Recommended storage includes additional capacity for indexes, WAL files, temporary files, VACUUM operations, backups, and future growth. For production deployments, a practical minimum allocation of **100 GB** is recommended regardless of the initial database size.

| Expected Observations | Estimated DB Size | Recommended DB Storage |
|---:|---:|---:|
| 500,000 | ~300 MB | 100 GB minimum |
| 5,000,000 | ~3 GB | 100 GB minimum |
| 50,000,000 | ~30 GB | 250 GB |
| 500,000,000 | ~300 GB | 500 GB to 1 TB |

> **Note on raster data:** Raster files are stored on the application server's disk, not in PostgreSQL. Only raster metadata and spatial indexes enter the database. Raster storage must be planned separately from the observation estimates above — see *Application Storage Sizing* below.

### Memory Relative to Data Volume

PostgreSQL performs best when the active working dataset fits within the combined `shared_buffers` and operating system page cache.

| Database Size | Recommended RAM | Notes |
|---:|---:|---|
| < 10 GB | 8–16 GB | Covers pilot and early production deployments |
| 10–60 GB | 32 GB | Working dataset fits comfortably in the OS page cache |
| 60–300 GB | 64 GB | Larger buffer pool reduces I/O. SSD storage is critical |
| > 300 GB | 128+ GB | Consider a dedicated database server |

### Per-Query Memory (work_mem)

SoilHive sets `work_mem` to **512 MB** for the duration of heavy transactions (data export, ingestion, and geospatial queries) and **256 MB** for filtering mask operations. This is set with `SET LOCAL`, so it applies only for the lifetime of those transactions, not globally.

If RAM is insufficient to satisfy `work_mem` requests, PostgreSQL spills sort and hash operations to temporary disk files. This degrades query performance severely — operations that should complete in seconds can stall for minutes. Under sustained memory pressure, the Linux OOM killer may terminate the PostgreSQL process entirely, causing an unplanned database restart.

PostgreSQL allocates `work_mem` per sort or hash operation, per concurrent connection running a heavy transaction. The table below shows how this stacks up across concurrent heavy operations:

| Concurrent heavy operations | Additional RAM for work_mem |
|---:|---:|
| 2 | ~1 GB |
| 5 | ~2.5 GB |
| 10 | ~5 GB |
| 20 | ~10 GB |

For **pilot and small-production** deployments with few concurrent users, the profiles in the Infrastructure Profiles table already accommodate this. For **medium and large** deployments with frequent concurrent exports or ingestions, ensure RAM headroom above the data-volume figures above, or reduce `max_connections` to match available RAM.

As a general guideline, provision enough RAM for the active working set of the database rather than the entire database.

---

## Application Storage Sizing

The application server hosts the SoilHive backend and frontend containers. Storage requirements come from two sources:

**Application runtime** — the OS, Docker images, logs, and temporary files. This is bounded and small. The baseline figures in the Infrastructure Profiles table cover this component.

**Raster files** — stored on the application server's disk outside PostgreSQL. Raster storage requirements depend on the datasets in use and must be planned separately from the application runtime baseline.

### Map-based filter rasters (current release)

The current release uses a fixed set of raster files to support map-based filters. These are not included in the Docker containers — they must be installed as a separate step after the system first starts. See [Map-Based Filters](map-based-filters.md) for installation instructions and the full list of available filters.

Each filter is a separate package. Sizes range from **30 MB** (Soil Groups) to **3.6 GB** (Land Cover 2019). Installing all available filters requires approximately **6.3 GB** of disk space on the application server. Operators should allocate this in addition to the application runtime baseline before completing the initial setup.

### User-loaded raster datasets (future releases)

Future releases will allow users to load their own raster datasets into SoilHive. Raster files (GeoTIFFs and similar formats) vary widely in size depending on spatial resolution, geographic extent, and band count. A single national-scale dataset at moderate resolution can range from a few hundred MB to tens of GB.

For deployments planning to support user-loaded raster data, allocate raster storage in addition to the application baseline figures in the Infrastructure Profiles table. Local SSD, NAS, or object storage (S3-compatible) are all viable depending on deployment size and access patterns.

---

## Recommended Software Stack

| Component | Recommendation |
|---|---|
| Operating System | Ubuntu Server LTS or RHEL compatible Linux |
| Application Runtime | Docker (two application containers: backend and frontend) |
| Database | PostgreSQL 18 + PostGIS |
| Reverse Proxy | Nginx or equivalent |
| Authentication | Optional Keycloak or compatible OIDC provider |
| Storage | Local SSD, NAS, or object storage depending on deployment size |
| Monitoring | Depends on target infrastructure |
| Backups | Database and file storage backups |

---

## Notes

These infrastructure profiles are intended as practical deployment guidance and represent recommended starting points rather than hard limits.

Partners hosting large raster datasets, frequent ingestion workloads, or many concurrent users may require additional storage, memory, or dedicated infrastructure components.
