import Dataset from "../../src/entities/Dataset";
import { getEntityManager } from "../../src/utils/data-source";
import { Polygon } from "typeorm";

describe("Dataset entity", () => {
  it("Creates and saves a new dataset", async () => {
    const polygon: Polygon = {
      coordinates: [
        [
          [11.322484394, 44.503691914],
          [11.322484394, 44.481483367],
          [11.364550612, 44.481483367],
          [11.364550612, 44.503691914],
          [11.322484394, 44.503691914],
        ],
      ],
      type: "Polygon",
    };
    const dataset = new Dataset();
    dataset.name = "name";
    dataset.slug = "slug";
    dataset.created_by = "created_by";
    dataset.spatial_extent = polygon;

    const entityManager = await getEntityManager();
    const repo = await entityManager.getRepository(Dataset);
    const saved = await repo.save(dataset);

    const savedLocation = await repo.findOneBy({ id: saved.id });
    expect(savedLocation).toBeDefined();
    expect(savedLocation?.spatial_extent).toEqual(polygon);
  });
});
