# Infrastructure Requirements

## Deployment Model

SoilHive Open Source is a Node.js and React based application connected to a PostgreSQL/PostGIS database.

The recommended deployment model is a Docker based environment running the SoilHive application container alongside a PostgreSQL/PostGIS database.

For **pilot** and **small production** environments, the application container and PostgreSQL database can run on the same server, simplifying deployment and operations.

For **medium** and **large production** environments, PostgreSQL/PostGIS should run on a dedicated server, as the database is the primary performance sensitive component of the system and is responsible for geospatial queries, indexing, ingestion, and export workloads.

SoilHive does not require public cloud infrastructure and can run in government datacentres, virtual machines, or bare metal Linux servers.

---

## Infrastructure Profiles

The following profiles provide recommended starting points for provisioning infrastructure.

Actual requirements will depend on dataset size, ingestion frequency, user concurrency, and export workloads.

| Profile               | Deployment Layout                                   | CPU                          | RAM                    | Storage                        | Typical Use                                   |
| --------------------- | --------------------------------------------------- | ---------------------------: | ---------------------: | -----------------------------: | --------------------------------------------- |
| **Pilot**             | 1 server running SoilHive + PostgreSQL              | 4 cores                      | 16 GB                  | 250 GB SSD                     | Evaluation, demos, training                   |
| **Small Production**  | 1 server running SoilHive + PostgreSQL              | 8 cores                      | 32 GB                  | 500 GB to 1 TB SSD             | Initial institutional deployment              |
| **Medium Production** | 1 SoilHive server + 1 PostgreSQL server             | App: 4 cores  DB: 8 cores    | App: 16 GB  DB: 32 GB  | App: 250 GB SSD  DB: 1 TB SSD  | Operational deployment with multiple datasets |
| **Large Production**  | Dedicated application, database and storage servers | App: 8+ cores  DB: 16+ cores | App: 32 GB  DB: 64+ GB | App: 250 GB SSD  DB: 2+ TB SSD | Large scale or national deployments           |

---

## Why PostgreSQL/PostGIS Drives Sizing

The main infrastructure demand in SoilHive comes from the PostgreSQL/PostGIS database rather than the frontend or API layer.

PostgreSQL/PostGIS is responsible for:

- Geospatial queries and filtering
- Spatial indexing
- Dataset ingestion
- Export generation
- Metadata and configuration storage

Spatial workloads are typically sensitive to:

- Available RAM for caching and indexing
- CPU for concurrent queries and processing
- SSD backed storage for low latency disk I/O

For this reason, larger deployments benefit from separating the database from the application layer.

---

## Minimum PostgreSQL/PostGIS Requirements

The following represent minimum recommended database requirements.

| Component        | Requirement                           |
| ---------------- | ------------------------------------- |
| PostgreSQL       | Version 18                            |
| Extension        | PostGIS enabled                       |
| CPU              | 4 cores minimum                       |
| RAM              | 8 GB minimum                          |
| Storage          | SSD required                          |
| Database Storage | 100 GB minimum                        |
| Spatial Indexing | GiST indexes enabled where applicable |
| Backups          | Daily database backups recommended    |

---

## Recommended Software Stack

| Component           | Recommendation                                                  |
| ------------------- | --------------------------------------------------------------- |
| Operating System    | Ubuntu Server LTS or RHEL compatible Linux                      |
| Application Runtime | Docker                                                          |
| Database            | PostgreSQL 18 + PostGIS                                         |
| Reverse Proxy       | Nginx or equivalent                                             |
| Authentication      | Optional Keycloak or compatible OIDC provider                   |
| Storage             | Local SSD, NAS, or object storage depending on deployment size  |
| Monitoring          | Existing datacentre monitoring or ???? |
| Backups             | Database and file storage backups                               |

---

## Notes

These infrastructure profiles are intended as practical deployment guidance and represent recommended starting points rather than hard limits.

Partners hosting large raster datasets, frequent ingestion workloads, or many concurrent users may require additional storage, memory, or dedicated infrastructure components.