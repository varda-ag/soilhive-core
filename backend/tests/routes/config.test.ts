import request from "supertest";
import { app } from "../../src/app";
import { getDataSource } from "../../src/utils/data-source";

describe("GET /config", () => {
  it("Responds with not found", async () => {
    const res = await request(app).get("/config/wrong-id");
    expect(res.statusCode).toBe(404);
  });

  it("Responds with the expected config", async () => {
    const data = { key: "value" };
    await createTestConfig(data);
    const res = await request(app).get("/config/test-config");
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
  });

  it("Deletes the config", async () => {
    const data = { key: "value" };
    await createTestConfig(data);
    const res = await request(app).delete("/config/test-config");
    expect(res.statusCode).toBe(204);
    const row = await getTestConfig();
    expect(row).toBeUndefined();
  });
});

const createTestConfig = async (data: any) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository("JsonStorage");
  const id = "test-config";
  await repo.save({ id, data });
};

const getTestConfig = async () => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository("JsonStorage");
  const id = "test-config";
  await repo.findOneBy({ id });
};
