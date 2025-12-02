import request from "supertest";
import { app } from "../../src/app";
import { getSuperAdminToken } from "../helper";
import { IncomingHttpHeaders } from "http";

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
      geometries: [
        {
          coordinates: {},
          type,
        },
      ],
    };
    const res = await request(app).post("/datasets/filters").send(payload);
    expect(res.statusCode).toBe(expectedStatus);
  });
});
