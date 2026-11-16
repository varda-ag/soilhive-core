import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Token } from '../../src/interfaces/Token';
import { emailClaim, getUserinfoEmail, resetUserinfoEndpoint } from '../../src/utils/userinfo';

const AUTHORITY = 'https://idp.example/realms/soilhive';
const token = { sub: 'jane-sub', raw: 'raw-access-token' } as Token;

describe('getUserinfoEmail', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let userinfo: () => Partial<Response>;

  beforeEach(() => {
    process.env.OIDC_AUTHORITY = `${AUTHORITY}/`;
    resetUserinfoEndpoint();
    userinfo = () => ({ ok: true, json: async () => ({ sub: 'jane-sub', email: 'jane@example.com' }) });
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async input =>
        String(input).endsWith('/.well-known/openid-configuration')
          ? ({ ok: true, json: async () => ({ userinfo_endpoint: `${AUTHORITY}/userinfo` }) } as Response)
          : (userinfo() as Response),
      );
  });

  afterEach(() => {
    delete process.env.OIDC_AUTHORITY;
    fetchSpy.mockRestore();
  });

  it("returns the provider's email, asking with the caller's own token", async () => {
    expect(await getUserinfoEmail(token)).toBe('jane@example.com');
    expect(fetchSpy).toHaveBeenCalledWith(`${AUTHORITY}/.well-known/openid-configuration`, expect.anything());
    expect(fetchSpy).toHaveBeenCalledWith(
      `${AUTHORITY}/userinfo`,
      expect.objectContaining({ headers: { Authorization: 'Bearer raw-access-token' } }),
    );
  });

  it('looks the endpoint up once', async () => {
    await getUserinfoEmail(token);
    await getUserinfoEmail(token);
    expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('openid-configuration'))).toHaveLength(1);
  });

  it('is undefined without an identity provider', async () => {
    delete process.env.OIDC_AUTHORITY;
    expect(await getUserinfoEmail(token)).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is undefined when the provider holds no email', async () => {
    userinfo = () => ({ ok: true, json: async () => ({ sub: 'jane-sub', email: ' ' }) });
    expect(await getUserinfoEmail(token)).toBeUndefined();
  });

  it.each([
    ['answers for another sub', () => ({ ok: true, json: async () => ({ sub: 'someone-else', email: 'jane@example.com' }) })],
    ['refuses the token', () => ({ ok: false, status: 401 })],
  ])('is a 502 when the provider %s', async (_label, answer) => {
    userinfo = answer as () => Partial<Response>;
    await expect(getUserinfoEmail(token)).rejects.toMatchObject({ status: 502 });
  });
});

describe('emailClaim', () => {
  it.each([
    ['jane@example.com', 'jane@example.com'],
    [' jane@example.com ', 'jane@example.com'],
    ['', undefined],
    [undefined, undefined],
    [42, undefined],
  ])('reads %p as %p', (value, expected) => {
    expect(emailClaim(value)).toBe(expected);
  });
});
