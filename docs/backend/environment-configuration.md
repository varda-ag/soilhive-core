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

### Asynchronous jobs

[pg-boss](https://github.com/timgit/pg-boss) is used to manage long running jobs. Following environment variables are used to manage concurrency:
- `JOB_LOCAL_CONCURRENCY`: Number of workers to spawn for each queue (per-node). Each worker polls and processes jobs independently
- `JOB_GROUP_CONCURRENCY`: Limit concurrent jobs per group globally across all nodes (database tracking). Coordinates across distributed deployments via database queries.

More information is available in `pg-boss` website.
