import Location from "../../src/entities/Location";
import { getEntityManager } from "../../src/utils/data-source";

describe("Location entity", () => {
  it("Creates and saves a new location", async () => {
    const location = new Location();
    location.coordinates = { type: "Point", coordinates: [0.0098, 51.4934] };

    const entityManager = await getEntityManager();
    const repo = await entityManager.getRepository(Location);
    const saved = await repo.save(location);

    const savedLocation = await repo.findOneBy({ id: saved.id });
    expect(savedLocation).toBeDefined();
    expect(savedLocation?.coordinates).toEqual(location.coordinates);
  });
});
