import request from "supertest";
import { app } from "../../src/app";
import { getDataSource } from "../../src/utils/data-source";

const ID = "test-config";

describe("Testing /config/{id} routes", () => {
  it("PUT saves the config", async () => {
    const data = { customValue: 123.456 };
    const res = await request(app).put("/config/test-config").send(data);
    expect(res.statusCode).toBe(200);
    const row = await getTestConfigFromDB();
    expect(row).toBeDefined();
    expect(row!.id).toStrictEqual(ID);
    expect(row!.data).toStrictEqual(data);
  });

  it("GET responds with not found", async () => {
    const res = await request(app).get("/config/wrong-id");
    expect(res.statusCode).toBe(404);
  });

  it("GET responds with the expected config", async () => {
    const data = { key: "value" };
    await createTestConfigInDB(data);
    const res = await request(app).get("/config/test-config");
    expect(res.statusCode).toBe(200);
    expect(res.body).toStrictEqual(data);
  });

  it("DELETE removes the config", async () => {
    const data = { key: "value" };
    await createTestConfigInDB(data);
    const res = await request(app).delete("/config/test-config");
    expect(res.statusCode).toBe(204);
    const row = await getTestConfigFromDB();
    expect(row).toBeNull();
  });

  it("Deletes (soft) an existing config, then creates it again: it should be restored", async () => {
    const data = { key: "value" };
    await createTestConfigInDB(data);
    await request(app).delete("/config/test-config");
    const row = await getTestConfigFromDB();
    expect(row).toBeNull();
    await request(app).put("/config/test-config").send(data);
    const row2 = await getTestConfigFromDB();
    expect(row2).not.toBeNull();
  });
});

const createTestConfigInDB = async (data: any) => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository("JsonStorage");
  const id = ID;
  await repo.save({ id, data });
};

const getTestConfigFromDB = async () => {
  const dataSource = await getDataSource();
  const repo = dataSource.getRepository("JsonStorage");
  const id = ID;
  return await repo.findOneBy({ id });
};
