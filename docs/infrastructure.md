# Infrastructure Requirements

## Deployment Model

SoilHive Open Source is a Node.js and React based application connected to a PostgreSQL/PostGIS database.

The recommended deployment model is a Docker based deployment running the SoilHive application container alongside a PostgreSQL/PostGIS database.

For **pilot** and **small production** environments, the application container and PostgreSQL database can run on the same server, simplifying deployment and operations.

For **medium** and **large production** environments, PostgreSQL/PostGIS should run on a dedicated server, as the database is the primary performance sensitive component of the system and is responsible for geospatial queries, indexing, ingestion, and export workloads.

SoilHive does not require public cloud infrastructure and can run in government data centres, virtual machines, or bare metal Linux servers.

---

## Infrastructure Profiles

The following profiles provide recommended starting points for provisioning infrastructure.

Actual requirements will depend on dataset size, ingestion frequency, user concurrency, and export workloads.

| Profile | Deployment Layout | CPU | RAM | Storage | Typical Use |
|---|---|---:|---:|---:|---|
| **Pilot** | 1 server running SoilHive + PostgreSQL | 4 cores | 16 GB | 250 GB SSD | Evaluation, demos, training |
| **Small Production** | 1 server running SoilHive + PostgreSQL | 8 cores | 32 GB | 500 GB to 1 TB SSD | Initial institutional deployment |
| **Medium Production** | 1 SoilHive server + 1 PostgreSQL server | App: 4 cores<br>DB: 8 cores | App: 16 GB<br>DB: 32 GB | App: 250 GB SSD<br>DB: 1 TB SSD | Operational deployment with multiple datasets |
| **Large Production** | Dedicated application, database and storage servers | App: 8+ cores<br>DB: 16+ cores | App: 32 GB<br>DB: 64+ GB | App: 250 GB SSD<br>DB: 2+ TB SSD | Large scale or national deployments |

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

> **Note on raster data:** Raster datasets are stored as files on disk outside PostgreSQL. Only raster metadata and spatial indexes are stored in the database, so raster storage should be planned separately from the observation estimates above.

### Memory Relative to Data Volume

PostgreSQL performs best when the active working dataset fits within the combined `shared_buffers` and operating system page cache.

| Database Size | Recommended RAM | Notes |
|---:|---:|---|
| < 10 GB | 8–16 GB | Covers pilot and early production deployments |
| 10–60 GB | 32 GB | Working dataset fits comfortably in the OS page cache |
| 60–300 GB | 64 GB | Larger buffer pool reduces I/O. SSD storage is critical |
| > 300 GB | 128+ GB | Consider a dedicated database server |

As a general guideline, provision enough RAM for the active working set of the database rather than the entire database.

---

## Recommended Software Stack

| Component | Recommendation |
|---|---|
| Operating System | Ubuntu Server LTS or RHEL compatible Linux |
| Application Runtime | Docker |
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
