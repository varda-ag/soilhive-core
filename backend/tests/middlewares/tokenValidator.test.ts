import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { INTERNAL_REQUEST_TOKEN_PAYLOAD } from '../../src/constants/constants';
import { TOKEN_ISSUER, TokenScopes } from '../../src/types/enums';
import { getPasswordGrantKey, signPasswordGrantToken } from '../../src/utils/password-grant-key';

const IDP = 'https://idp.example/realms/soilhive';

// Helper: build a minimal mock Express Request
function makeRequest(authHeader?: string): any {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    customData: {},
  };
}

// Helper: sign an HS256 token with SELF_SIGNING_SECRET and a kid in the JWT header — an internal-request
// token, or an IdP token where jwks-rsa is mocked to return the secret.
function signTestToken(payload: any, opts: { expiresIn?: number; kid?: string } = {}): string {
  const secret = process.env.SELF_SIGNING_SECRET!;
  const signOptions: jwt.SignOptions = {
    algorithm: 'HS256',
    header: { kid: opts.kid ?? 'kid' } as any,
  };
  if (opts.expiresIn !== undefined) {
    signOptions.expiresIn = opts.expiresIn;
  }
  return jwt.sign(payload, secret, signOptions);
}

// ---------------------------------------------------------------------------
// NONE mode
// ---------------------------------------------------------------------------

describe('tokenValidator — NONE mode (auth not configured)', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'none' }) },
    }));
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('throws 401 with the "no auth configured" message', async () => {
    await expect(tokenValidator(makeRequest(), [])).rejects.toMatchObject({
      message: 'No authentication system has been configured in the platform',
      status: 401,
    });
  });
});

// ---------------------------------------------------------------------------
// PASSWORD mode
// ---------------------------------------------------------------------------

describe('tokenValidator — PASSWORD mode', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'password' }) },
    }));
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false when no Authorization header is present', async () => {
    expect(await tokenValidator(makeRequest(), [])).toBe(false);
  });

  it('returns false when Authorization header contains no token', async () => {
    expect(await tokenValidator(makeRequest('Bearer '), [])).toBe(false);
  });

  it('throws 401 on a token string that cannot be decoded (header decode failure)', async () => {
    // No dots in the string → jwt.decode returns null
    await expect(tokenValidator(makeRequest('Bearer notajwtatall'), [])).rejects.toMatchObject({
      message: 'Invalid token: header decode failure',
      status: 401,
    });
  });

  it('throws 401 when the JWT header contains no kid', async () => {
    // jwt.sign without a custom header produces { alg, typ } — no kid
    const tokenNoKid = jwt.sign({ sub: 'u1', scope: 'super-admin' }, process.env.SELF_SIGNING_SECRET!, {
      algorithm: 'HS256',
    });
    await expect(tokenValidator(makeRequest(`Bearer ${tokenNoKid}`), [])).rejects.toMatchObject({
      message: 'Invalid token: no kid',
      status: 401,
    });
  });

  it('returns true for an internal-request token (signed with SELF_SIGNING_SECRET)', async () => {
    const internalToken = signTestToken(INTERNAL_REQUEST_TOKEN_PAYLOAD, { kid: TokenScopes.INTERNAL_REQUEST });
    expect(await tokenValidator(makeRequest(`Bearer ${internalToken}`), [])).toBe(true);
  });

  it('rejects an HS256 token under any kid other than internal-request', async () => {
    // The pre-ES256 Password-grant token shape
    const token = signTestToken({ sub: 'u1', scope: 'super-admin' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: unknown kid',
      status: 401,
    });
  });

  it('rejects an HS256 token carrying the Password-grant kid', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin' }, { kid: getPasswordGrantKey().kid, expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: invalid algorithm',
      status: 401,
    });
  });

  it('rejects a Password-grant token signed before the secret rotated', async () => {
    const currentSecret = process.env.SELF_SIGNING_SECRET;
    process.env.SELF_SIGNING_SECRET = 'previous-secret';
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin' }, 3600);
    process.env.SELF_SIGNING_SECRET = currentSecret;
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: unknown kid',
      status: 401,
    });
  });

  it('validates a regular token with no scope requirements and attaches it to req.customData', async () => {
    const payload = { iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' };
    const token = signPasswordGrantToken(payload, 3600);
    const req = makeRequest(`Bearer ${token}`);

    expect(await tokenValidator(req, [])).toBe(true);
    expect(req.customData.token.sub).toBe('u1');
    expect(req.customData.token.raw).toBe(token);
  });

  it('validates successfully when the token scope satisfies a required scope', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, 3600);
    expect(await tokenValidator(makeRequest(`Bearer ${token}`), ['super-admin'])).toBe(true);
  });

  it('throws 403 when the token scope does not satisfy any required scope', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'data-admin', email: 'u1@test.com' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), ['super-admin'])).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 401 when the decoded token has no sub claim', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, scope: 'super-admin', email: 'u1@test.com' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: no sub',
      status: 401,
    });
  });

  it('validates successfully when the decoded token has no email claim', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).resolves.toBe(true);
  });

  it('throws "Token has expired" for an already-expired token', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, -1);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toThrow('Token has expired');
  });

  it('throws "Invalid token: ..." for a token with a tampered signature', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, 3600);
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(tokenValidator(makeRequest(`Bearer ${tampered}`), [])).rejects.toThrow(/^Invalid token: /);
  });

  it('isSuperAdmin === true and isDataAdmin === false when scope is super-admin', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, 3600);
    const req = makeRequest(`Bearer ${token}`);
    await tokenValidator(req, []);
    expect(req.customData.token.isSuperAdmin).toBe(true);
    expect(req.customData.token.isDataAdmin).toBe(false);
  });

  it('isDataAdmin === true and isSuperAdmin === false when scope is data-admin', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'data-admin', email: 'u1@test.com' }, 3600);
    const req = makeRequest(`Bearer ${token}`);
    await tokenValidator(req, []);
    expect(req.customData.token.isDataAdmin).toBe(true);
    expect(req.customData.token.isSuperAdmin).toBe(false);
  });

  it('wraps a jwt.verify error as "Invalid token: ..."', async () => {
    // After resetModules(), the tokenValidator and this import() share the same fresh
    // jsonwebtoken instance. Spying on its .default.verify patches the function used internally.
    const { default: jwtDefault } = await import('jsonwebtoken');
    jest.spyOn(jwtDefault as any, 'verify').mockImplementation((_token, _key, _options, callback: any) => {
      callback(new Error('verify failed'));
    });

    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: verify failed',
      status: 401,
    });
  });
});

// ---------------------------------------------------------------------------
// OIDC mode — happy path
// ---------------------------------------------------------------------------

describe('tokenValidator — OIDC mode, successful JWKS lookup', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    process.env.OIDC_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    process.env.OIDC_AUTHORITY = IDP;
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    // Mock jwks-rsa to return SELF_SIGNING_SECRET as the "public key" so that
    // jwt.verify can still validate the HS256 test tokens we create.
    jest.doMock('jwks-rsa', () =>
      jest.fn(() => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        getSigningKey: (_kid: string, cb: Function) => cb(null, { getPublicKey: () => process.env.SELF_SIGNING_SECRET }),
      })),
    );
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('validates a token by fetching the signing key from JWKS', async () => {
    const token = signTestToken({ iss: IDP, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    expect(await tokenValidator(makeRequest(`Bearer ${token}`), [])).toBe(true);
  });

  it('rejects a Password-grant token, whose key is trusted in PASSWORD mode only', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({ status: 401 });
  });

  it('reuses the same JWKS client instance across multiple calls', async () => {
    // The jwks-rsa module was loaded (and cached) by tokenValidator's import above.
    // Re-importing it here fetches the same cached instance from the module registry.
    const { default: jwksRsa } = await import('jwks-rsa');
    const token = signTestToken({ iss: IDP, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    await tokenValidator(makeRequest(`Bearer ${token}`), []);
    await tokenValidator(makeRequest(`Bearer ${token}`), []);
    // The constructor should only be called once; the module-level client is reused.
    expect(jwksRsa).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// OIDC mode — JWKS error
// ---------------------------------------------------------------------------

describe('tokenValidator — OIDC mode, JWKS key retrieval failure', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    process.env.OIDC_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    process.env.OIDC_AUTHORITY = IDP;
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    jest.doMock('jwks-rsa', () =>
      jest.fn(() => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        getSigningKey: (_kid: string, cb: Function) => cb(new Error('JWKS fetch failed'), null),
      })),
    );
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('throws when JWKS returns an error for the kid lookup', async () => {
    const token = signTestToken({ iss: IDP, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toThrow('Invalid token: JWKS fetch failed');
  });
});

// ---------------------------------------------------------------------------
// OIDC mode — getPublicKey throws
// ---------------------------------------------------------------------------

describe('tokenValidator — OIDC mode, getPublicKey throws', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    process.env.OIDC_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    process.env.OIDC_AUTHORITY = IDP;
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    jest.doMock('jwks-rsa', () =>
      jest.fn(() => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        getSigningKey: (_kid: string, cb: Function) =>
          cb(null, {
            getPublicKey: () => {
              throw new Error('key format unsupported');
            },
          }),
      })),
    );
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('throws when getPublicKey throws during signing key extraction', async () => {
    const token = signTestToken({ iss: IDP, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toThrow('Invalid token: key format unsupported');
  });
});

// ---------------------------------------------------------------------------
// OIDC mode — internal-request kid skips JWKS lookup
// ---------------------------------------------------------------------------

describe('tokenValidator — OIDC mode, internal-request kid skips JWKS lookup', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;
  let getSigningKeySpy: ReturnType<typeof jest.fn>;

  beforeEach(async () => {
    jest.resetModules();
    process.env.OIDC_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    process.env.OIDC_AUTHORITY = IDP;
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    getSigningKeySpy = jest.fn((_kid: string, cb: Function) => cb(new Error('unexpected JWKS call'), null));
    jest.doMock('jwks-rsa', () => jest.fn(() => ({ getSigningKey: getSigningKeySpy })));
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('does not call getSigningKey when token kid equals TokenScopes.INTERNAL_REQUEST', async () => {
    const token = signTestToken(
      { iss: TOKEN_ISSUER, sub: 'u1', scope: 'super-admin', email: 'u1@test.com' },
      { kid: TokenScopes.INTERNAL_REQUEST, expiresIn: 3600 },
    );
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).resolves.toBe(true);
    expect(getSigningKeySpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OIDC mode — missing OIDC_JWKS_URL
// ---------------------------------------------------------------------------

describe('tokenValidator — OIDC mode, OIDC_JWKS_URL not set', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    delete process.env.OIDC_JWKS_URL;
    process.env.OIDC_AUTHORITY = IDP;
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    jest.doMock('jwks-rsa', () => jest.fn());
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('throws an assertion error when OIDC_JWKS_URL is missing', async () => {
    const token = signTestToken({ iss: IDP, sub: 'u1', scope: 'super-admin' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toThrow(
      'Invalid token: Missing environment variable: OIDC_JWKS_URL',
    );
  });
});

// ---------------------------------------------------------------------------
// Issuer and audience (docs/adr/0064)
// ---------------------------------------------------------------------------

describe('tokenValidator — the issuer of platform-issued tokens', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'password' }) },
    }));
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it.each([
    ['another issuer', { iss: 'https://elsewhere.example' }],
    ['no issuer', {}],
  ])('rejects a Password-grant token with %s, though the key signed it', async (_, claims) => {
    const token = signPasswordGrantToken({ sub: 'u1', scope: 'super-admin', ...claims }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: expect.stringMatching(/^Invalid token: jwt issuer invalid/),
      status: 401,
    });
  });

  it('rejects an internal-request token with another issuer', async () => {
    const token = signTestToken({ ...INTERNAL_REQUEST_TOKEN_PAYLOAD, iss: 'someone-else' }, { kid: TokenScopes.INTERNAL_REQUEST });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({ status: 401 });
  });
});

describe('tokenValidator — the issuer and audience of IdP tokens', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;
  const idpToken = (claims: object) => signTestToken({ sub: 'u1', scope: 'user', ...claims }, { expiresIn: 3600 });

  beforeEach(async () => {
    jest.resetModules();
    process.env.OIDC_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    process.env.OIDC_AUTHORITY = IDP;
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    jest.doMock('jwks-rsa', () =>
      jest.fn(() => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        getSigningKey: (_kid: string, cb: Function) => cb(null, { getPublicKey: () => process.env.SELF_SIGNING_SECRET }),
      })),
    );
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it.each([IDP, `${IDP}/`])('accepts the issuer %s, with or without a trailing slash', async iss => {
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss })}`), [])).resolves.toBe(true);
  });

  it('accepts an OIDC_AUTHORITY set with a trailing slash', async () => {
    process.env.OIDC_AUTHORITY = `${IDP}/`;
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: IDP })}`), [])).resolves.toBe(true);
  });

  it('rejects a token from another realm or provider', async () => {
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: 'https://idp.example/realms/other' })}`), [])).rejects.toMatchObject({
      message: expect.stringMatching(/^Invalid token: jwt issuer invalid/),
      status: 401,
    });
  });

  it('accepts every issuer OIDC_ISSUER lists, as well as OIDC_AUTHORITY', async () => {
    process.env.OIDC_ISSUER = 'https://login.example/realms/soilhive, http://keycloak.internal/realms/soilhive';
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: 'http://keycloak.internal/realms/soilhive' })}`), [])).resolves.toBe(
      true,
    );
    // Listing a Machine caller's issuer must never refuse the browser's
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: IDP })}`), [])).resolves.toBe(true);
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: 'https://idp.example/realms/other' })}`), [])).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects every IdP token when no issuer is configured, rather than skipping the check', async () => {
    delete process.env.OIDC_AUTHORITY;
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: IDP })}`), [])).rejects.toMatchObject({
      message: 'Invalid token: no issuer is configured to check it against',
      status: 401,
    });
  });

  it('does not check the audience while OIDC_AUDIENCE is unset', async () => {
    await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: IDP, aud: 'account' })}`), [])).resolves.toBe(true);
  });

  describe('with OIDC_AUDIENCE', () => {
    beforeEach(() => {
      process.env.OIDC_AUDIENCE = 'soilhive-api, soilhive';
    });

    it.each([['soilhive-api'], [['account', 'soilhive']]])('accepts the audience %j', async aud => {
      await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: IDP, aud })}`), [])).resolves.toBe(true);
    });

    it.each([
      ['an audience for another client', { aud: 'account' }],
      ['no audience', {}],
    ])('rejects a token with %s', async (_, claims) => {
      await expect(tokenValidator(makeRequest(`Bearer ${idpToken({ iss: IDP, ...claims })}`), [])).rejects.toMatchObject({
        message: expect.stringMatching(/^Invalid token: jwt audience invalid/),
        status: 401,
      });
    });

    it('never asks it of an internal-request token', async () => {
      const token = signTestToken(INTERNAL_REQUEST_TOKEN_PAYLOAD, { kid: TokenScopes.INTERNAL_REQUEST });
      await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).resolves.toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Scopes are matched whole (docs/adr/0064)
// ---------------------------------------------------------------------------

describe('tokenValidator — scopes are matched as whole entries', () => {
  let tokenValidator: (req: any, scopes: string[]) => Promise<boolean>;
  const flags = (req: any) => ({
    isSuperAdmin: req.customData.token.isSuperAdmin,
    isDataAdmin: req.customData.token.isDataAdmin,
    isInternalRequest: req.customData.token.isInternalRequest,
  });

  beforeEach(async () => {
    jest.resetModules();
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'password' }) },
    }));
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it.each(['metadata-admin', 'soilhive-super-admin-viewer', 'no-internal-request'])(
    'grants no privilege to a scope that only contains one: %s',
    async scope => {
      const req = makeRequest(`Bearer ${signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: `openid ${scope}` }, 3600)}`);
      expect(await tokenValidator(req, [])).toBe(true);
      expect(flags(req)).toEqual({ isSuperAdmin: false, isDataAdmin: false, isInternalRequest: false });
    },
  );

  it('refuses a scoped route to a scope that only contains the one required', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'metadata-admin' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), ['data-admin'])).rejects.toMatchObject({ status: 403 });
  });

  it('still grants every scope the list holds', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: 'openid  super-admin data-admin' }, 3600);
    const req = makeRequest(`Bearer ${token}`);
    expect(await tokenValidator(req, ['data-admin'])).toBe(true);
    expect(flags(req)).toEqual({ isSuperAdmin: true, isDataAdmin: true, isInternalRequest: false });
  });

  it('reads a scope sent as an array', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1', scope: ['openid', 'data-admin'] }, 3600);
    const req = makeRequest(`Bearer ${token}`);
    expect(await tokenValidator(req, ['data-admin'])).toBe(true);
    expect(flags(req).isDataAdmin).toBe(true);
  });

  it('answers 403, not a crash, to a token without a scope on a scoped route', async () => {
    const token = signPasswordGrantToken({ iss: TOKEN_ISSUER, sub: 'u1' }, 3600);
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), ['data-admin'])).rejects.toMatchObject({ status: 403 });
  });
});
