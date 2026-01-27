# SoilHive Backend - AI Coding Guidelines

## Architecture Overview
This is a Node.js/TypeScript Express API for geospatial soil data management using TypeORM with PostgreSQL/PostGIS. Key components:
- **Controllers** (`src/controllers/`): Handle HTTP requests, delegate to services
- **Services** (`src/services/`): Business logic, data access via TypeORM repositories
- **Entities** (`src/entities/`): Database models extending `BaseTable` with UUIDv7 primary keys
- **Middlewares**: Transaction wrapper auto-commits/rolls back based on response status (200-399 commits, else rollback)
- **Data Layer** (`src/data-layer/`): Specialized storage handlers (e.g., `SoilDataStorage.ts` for raster/vector data)

## Critical Workflows
- **Development**: `npm run dev` (nodemon + ts-node, watches src/**/*.ts and openapi.yaml)
- **Build**: `npm run build` (TypeScript compile + copy openapi.yaml/assets to dist/)
- **Migrations**: Always `npm run build` first, then `npm run typeorm migration:run -- -d dist/utils/migrations-data-source.js`
- **Testing**: `npm run test` (Jest with --runInBand, custom setup in tests/jest.*.ts, uses test DB)
- **CLI Data Generation**: `npm run start -- --create-data <count> --bbox <minx,miny,maxx,maxy>`

## Project-Specific Patterns
- **Transaction Handling**: Every request gets `req.customData.entityManager` from transaction middleware. Use this for DB operations instead of global manager.
- **Entity Relations**: Use `@ForeignKey` decorators for deferred constraints (e.g., `SlugHistoryEntity` in `DatasetEntity`)
- **Storage Abstraction**: Configurable via `STORAGE_MODE` (local/S3), use `@flystorage/*` packages
- **Slug-Based Routing**: Datasets/files accessed via slugs, not IDs (e.g., `/datasets/{slug}`)
- **GeoJSON Validation**: Use `geojson-validation` for spatial data input
- **Error Responses**: Throw `ErrorResponse` from `utils/error.ts` with HTTP status codes
- **OpenAPI**: Routes validated against `src/openapi.yaml`, served at `/docs`

## Integration Points
- **Database**: PostgreSQL with PostGIS extension in custom schema (set via `POSTGRES_SCHEMA`)
- **Auth**: JWT-based with JWKS RSA, configurable via `AuthConfig.ts`
- **File Upload**: Multer with FlyStorage integration
- **External APIs**: Turf.js for geospatial operations

## Key Files to Reference
- `src/app.ts`: App initialization and middleware setup
- `src/middlewares/transaction.ts`: Transaction lifecycle example
- `src/entities/Dataset.ts`: Entity structure with relations
- `src/services/DatasetService.ts`: Service pattern with repository usage
- `src/utils/data-source.ts`: DB connection and schema management
- `README.md`: Environment setup and migration commands</content>
<parameter name="filePath">/Users/svaccari/varda/soilhive-core/backend/.github/copilot-instructions.md