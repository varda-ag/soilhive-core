import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { INTERNAL_REQUEST_TOKEN_PAYLOAD } from '../../src/constants/constants';
import { TokenScopes } from '../../src/types/enums';

// Helper: build a minimal mock Express Request
function makeRequest(authHeader?: string): any {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    customData: {},
  };
}

// Helper: sign a token with SELF_SIGNING_SECRET and a kid in the JWT header.
// This matches what AuthService produces in PASSWORD mode.
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

  it('returns true for an internal-request token (string payload signed with SELF_SIGNING_SECRET)', async () => {
    // BulkLoader creates tokens this way; payload must be the literal string 'internal-request'
    const internalToken = signTestToken(INTERNAL_REQUEST_TOKEN_PAYLOAD);
    expect(await tokenValidator(makeRequest(`Bearer ${internalToken}`), [])).toBe(true);
  });

  it('validates a regular token with no scope requirements and attaches it to req.customData', async () => {
    const payload = { sub: 'u1', scope: 'super-admin', email: 'u1@test.com' };
    const token = signTestToken(payload, { expiresIn: 3600 });
    const req = makeRequest(`Bearer ${token}`);

    expect(await tokenValidator(req, [])).toBe(true);
    expect(req.customData.token.sub).toBe('u1');
    expect(req.customData.token.raw).toBe(token);
  });

  it('validates successfully when the token scope satisfies a required scope', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    expect(await tokenValidator(makeRequest(`Bearer ${token}`), ['super-admin'])).toBe(true);
  });

  it('throws 403 when the token scope does not satisfy any required scope', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'data-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), ['super-admin'])).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws 401 when the decoded token has no sub claim', async () => {
    const token = signTestToken({ scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: no sub',
      status: 401,
    });
  });

  it('throws 401 when the decoded token has no email claim', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: no email',
      status: 401,
    });
  });

  it('throws "Token has expired" for an already-expired token', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: -1 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toThrow('Token has expired');
  });

  it('throws "Invalid token: ..." for a token with a tampered signature', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    const tampered = token.slice(0, -5) + 'XXXXX';
    await expect(tokenValidator(makeRequest(`Bearer ${tampered}`), [])).rejects.toThrow(/^Invalid token: /);
  });

  it('isSuperAdmin === true and isDataAdmin === false when scope is super-admin', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    const req = makeRequest(`Bearer ${token}`);
    await tokenValidator(req, []);
    expect(req.customData.token.isSuperAdmin).toBe(true);
    expect(req.customData.token.isDataAdmin).toBe(false);
  });

  it('isDataAdmin === true and isSuperAdmin === false when scope is data-admin', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'data-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    const req = makeRequest(`Bearer ${token}`);
    await tokenValidator(req, []);
    expect(req.customData.token.isDataAdmin).toBe(true);
    expect(req.customData.token.isSuperAdmin).toBe(false);
  });

  it('throws "Invalid token: decode failure" when jwt.verify resolves with a falsy value', async () => {
    // After resetModules(), the tokenValidator and this import() share the same fresh
    // jsonwebtoken instance. Spying on its .default.verify patches the function used internally.
    // First call: the synchronous internal-request check — throw to fall through.
    // Second call: the callback-based verifyAsync — deliver null to trigger the !decoded branch.
    const { default: jwtDefault } = await import('jsonwebtoken');
    jest.spyOn(jwtDefault as any, 'verify').mockImplementation((_token, _secret, callback: any) => {
      callback(new Error('not an internal token'));
    });

    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toMatchObject({
      message: 'Invalid token: not an internal token',
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
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
    expect(await tokenValidator(makeRequest(`Bearer ${token}`), [])).toBe(true);
  });

  it('reuses the same JWKS client instance across multiple calls', async () => {
    // The jwks-rsa module was loaded (and cached) by tokenValidator's import above.
    // Re-importing it here fetches the same cached instance from the module registry.
    const { default: jwksRsa } = await import('jwks-rsa');
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
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
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
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
    const token = signTestToken({ sub: 'u1', scope: 'super-admin', email: 'u1@test.com' }, { expiresIn: 3600 });
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
      { sub: 'u1', scope: 'super-admin', email: 'u1@test.com' },
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
    jest.doMock('../../src/services/ConfigService', () => ({
      __esModule: true,
      default: { getAuthConfig: jest.fn().mockReturnValue({ authMode: 'oidc' }) },
    }));
    jest.doMock('jwks-rsa', () => jest.fn());
    ({ tokenValidator } = await import('../../src/middlewares/tokenValidator'));
  });

  it('throws an assertion error when OIDC_JWKS_URL is missing', async () => {
    const token = signTestToken({ sub: 'u1', scope: 'super-admin' }, { expiresIn: 3600 });
    await expect(tokenValidator(makeRequest(`Bearer ${token}`), [])).rejects.toThrow(
      'Invalid token: Missing environment variable: OIDC_JWKS_URL',
    );
  });
});
