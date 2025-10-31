import request from "supertest";
import { app } from "../../src/app";

describe("GET /config", () => {
  it("Responds with not found", async () => {
    const res = await request(app).get("/config/wrong-id");
    expect(res.statusCode).toBe(404);
  });
});
