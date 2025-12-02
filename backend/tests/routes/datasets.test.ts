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
  it("Creates a new filter", async () => {
    const filter = {
      geometry: {},
    };
    const res = await request(app).post("/datasets/filters").set(superAdminAuthHeader).send(filter);
    expect(res.statusCode).toBe(201);
  });
});
