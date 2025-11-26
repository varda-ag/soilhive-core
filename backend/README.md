# SoilHive backend

### DEV environment setup

1. Install and start Docker daemon
2. Copy `.env-example` to `.env` and set proper values (defaults are provided) 
3. Install dependencies with `npm i`
4. Test everything with `npm run test`
5. Run development environment with `npm run dev`

### Useful commands

```
# Build the application
npm run build

# Run the compiled app
npm run start

# Run the dev environment with nodemon
npm run dev

# Run tests in watch mode
npm run test:watch
```

Application will start at http://localhost:4001

### Working with the database

Every request is wrapped around a transaction. It will be automatically committed or rolled back depending on request status code:
```
if (res.statusCode >= 200 && res.statusCode < 400) {
  await queryRunner.commitTransaction();
} else {
  await queryRunner.rollbackTransaction();
}
```

As an example, let's say we want to add a `Location` to the database:
```
const location = new Location();
location.coordinates = { type: "Point", coordinates: [0.0098, 51.4934] };
```

To run the query inside the request transaction:
```
const repo = req.customData.entityManager.getRepository(Location);
await repo.save(location);
```

To run the query independently:
```
import { getEntityManager } from "../../src/utils/data-source";

const entityManager = await getEntityManager();
const repo = await entityManager.getRepository(Location);
const saved = await repo.save(location);
```

### Migrations

TypeORM provides a built in CLI tool to work with migrations.
The tool is written in JavaScript, so migrations needs to be run from `dist` folder after transpile step.
That is why a separate database connection is defined in `src/utils/migrations-data-source.ts`.

Migration commands:
```
# Transpile (do this before working with migrations)
npm run build

# Creating a new (empty) migration
npm run typeorm migration:create src/migrations/MyNewMigration

# Generating "init" migration from current DB schema
npm run typeorm migration:generate -- CreateSchema -d dist/utils/migrations-data-source.js

# Applying migrations
npm run typeorm migration:run -- -d dist/utils/migrations-data-source.js

# Reverting migrations
npm run typeorm migration:revert -- -d dist/utils/migrations-data-source.js
```

# Configuration

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

# Logo

Default is Varda SoilHive logo.
Custom logo can be applied to platform.
Logo will be stored in configured storage at `/frontend/logo` location.

```
GET /frontend/logo
PUT /frontend/logo
DELETE /frontend/logo
```
