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

# Authentication mode

Three authentication options are provided:

1. `none`: authentication is disabled
2. `password`: "super admin" and "data admin" roles are linked to passwords stored in environment variables
3. `oidc`: environment variables are pointing to an external OIDC Identity Provider

### `none`

Platform is in read-only mode. All token protected endpoints are not reachable.

### `password`

Basic support for "super admin" and "data admin" roles with a hardcoded password.
No user support is provided.

### `oidc`

External IDP will be used to validate tokens.
Frontend will receive the login configuration from this backend.

### Token scopes

Platform supports two built-in scopes:

1. `super-admin`
2. `data-admin`

Endpoints may require a specific scope to return a successful response.