# Environment configuration

## Storage

Storage is configured using environment variables.

### Local filesystem (default)

```
STORAGE_MODE=local
LOCAL_STORAGE_ROOT_FOLDER=/tmp/soilhive-storage
```

### S3 compatible storage

Please follow [AWS guide](https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-envvars.html) to setup environment variables related to S3 access control. The AWS SDK v3 for JavaScript/TypeScript uses a credentials provider chain to authenticate the S3 client.

```
STORAGE_MODE=s3
S3_STORAGE_REGION=...
S3_STORAGE_BUCKET=...
S3_STORAGE_ROOT_FOLDER=...
```

Additionally, these variables control multipart uploads (via `@aws-sdk/lib-storage`'s `Upload`):
- `S3_STORAGE_PART_SIZE_MB` (default `64`): size of each part, in MB. Values below S3's 5MB minimum fall back to the default. A larger part size means fewer parts — and fewer round trips — for a given file size.
- `S3_STORAGE_QUEUE_SIZE` (default `4`): number of parts uploaded concurrently per file.

Per-upload memory use is bounded by `queueSize × partSize`; size these together against your available memory and expected concurrent-upload count, not independently.

### Upload size limit

- `MAX_UPLOAD_SIZE_MB` (default `500`): maximum size of an uploaded file, in MB. Shared by `POST /files` and `POST /frontend/logo` rather than a per-route limit — see `docs/adr/0029`.

## HTTP server

- `REQUEST_TIMEOUT_MS` (default `43200000`, 12 hours): how long the server keeps a request open before terminating it (`server.requestTimeout`). Node's own default is 5 minutes, which a large or slow-network file upload can exceed well before the client finishes sending data, failing the request with a 408 rather than a storage or application error.

## Asynchronous jobs

[pg-boss](https://github.com/timgit/pg-boss) is used to manage long running jobs. Following environment variables are used to manage concurrency:
- `JOB_LOCAL_CONCURRENCY`: Number of workers to spawn for each queue (per-node). Each worker polls and processes jobs independently
- `JOB_GROUP_CONCURRENCY`: Limit concurrent jobs per group globally across all nodes (database tracking). Coordinates across distributed deployments via database queries.

More information is available in `pg-boss` website.

The `data-requests` and `soil-indexes` jobs ignore `JOB_LOCAL_CONCURRENCY` and set their own:
- `DATA_REQUESTS_CONCURRENCY` (default `5`): `data-requests` jobs per node. **Read this together with `DATA_REQUESTS_WORK_MEM`** — each concurrent job asks Postgres for that much sort memory, several times over, so raising one without lowering the other multiplies the database's memory use. Per node: nothing sets a pg-boss group key, so `JOB_GROUP_CONCURRENCY` does not bound the total across pods.
- `DATA_REQUESTS_WORK_MEM` (default `128MB`): `work_mem` for the data-request aggregation queries. Lower values spill to disk sooner but let more jobs run at once.
- `SOIL_INDEXES_CONCURRENCY` (default `1`): `soil-indexes` jobs per node. One at a time until a real soil index exists and its cost is known.

Shared by both, since both resolve their aggregation areas the same way:
- `MAX_AGGREGATION_UNITS` (default `2000`): most aggregation areas a single job will report on. The job fails above this rather than dropping areas. `DATA_REQUESTS_MAX_UNITS` is the deprecated former name and is still honoured.

`data-requests` only:
- `DATA_REQUESTS_MAX_CELLS` (default `200000`): budget for a `descriptive` result, in `overall` + `results` rows. Above it the job fails before aggregating.
- `DATA_REQUESTS_MAX_CLASS_ENTRIES` (default `1000000`): budget for a `class-distribution` result, in rows × (classes + 1). Above it the job fails before aggregating; nothing is truncated.
- `DATA_REQUESTS_STATEMENT_TIMEOUT_MS` (default `1800000`, 30 minutes): statement timeout for the aggregation queries.
