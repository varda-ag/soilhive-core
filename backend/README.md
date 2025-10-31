# SoilHive backend

### DEV environment setup

1. Install and start Docker daemon
2. Copy `.env-example` to `.env` and set proper values (defaults are provided) 
3. Install dependencies with `npm i`
4. Test everything with `npm run test`

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