import request from "supertest";
import { app } from "../../src/app";
import { getSuperAdminToken } from "../helper";
import { IncomingHttpHeaders } from "http";
import { getDataSource } from "../../src/utils/data-source";
import { TokenScopes } from "../../src/types/types";

describe("Testing /datasets/filters routes", () => {
  let superAdminAuthHeader: IncomingHttpHeaders;
  beforeAll(async () => {
    // Get super admin token
    const token = await getSuperAdminToken();
    superAdminAuthHeader = { Authorization: `Bearer ${token}` };
  });

  it.each([
    ["Point", 400],
    ["Polygon", 201],
    ["MultiPolygon", 201],
  ])("Tests filter geometry type validation", async (type, expectedStatus) => {
    const payload = {
      parameters: {},
      geometries: [{ coordinates: {}, type }],
    };
    const res = await request(app).post("/datasets/filters").send(payload);
    expect(res.statusCode).toBe(expectedStatus);
  });

  it("Filter should be stored in DB", async () => {
    const payload = {
      parameters: {},
      geometries: [{ coordinates: {}, type: "Polygon" }],
    };
    const res = await request(app).post("/datasets/filters").set(superAdminAuthHeader).send(payload);
    expect(res.statusCode).toBe(201);
    const dataSource = await getDataSource();
    const repo = dataSource.getRepository("JsonStorage");
    const row = await repo.findOneBy({ id: `filter_${TokenScopes.SUPER_ADMIN}` });
    expect(row).toBeTruthy();
  });
});
