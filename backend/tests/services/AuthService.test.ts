import AuthService from "../../src/services/AuthService";

describe("Testing AuthService", () => {
  beforeEach(() => {
    const service = new AuthService();
    service.resetAuthConfig();
  });
  it("Ensure password mode is set when requesting a token", () => {
    const service = new AuthService();
    process.env.SUPER_ADMIN_PASSWORD_HASH = "";
    expect(() => service.getToken("")).toThrow(expect.objectContaining({ message: "Platform is not configured for password authentication" }));
  });

  it("Requesting a token using a wrong password", () => {
    const service = new AuthService();
    expect(() => service.getToken("wrong")).toThrow(expect.objectContaining({ message: "Invalid password" }));
  });

  it("Requesting a token using a valid password", () => {
    const service = new AuthService();
    service.getToken("superadmin");
    service.getToken("dataadmin");
  });
});
