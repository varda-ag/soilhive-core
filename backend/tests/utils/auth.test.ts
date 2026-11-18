import { describe, it, expect } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import { EntityManager } from 'typeorm';
import { datasetCapabilities, requireSub, getSubject, requireEmailSubject } from '../../src/utils/auth';
import { Capability } from '../../src/types/enums';
import { ErrorResponse } from '../../src/utils/error';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';

const buildRequestData = (token?: Partial<Token>): RequestData => ({
  entityManager: {} as EntityManager,
  entitlements: {},
  ...(token && {
    token: {
      sub: 'user-sub',
      raw: 'raw-auth-token',
      scope: 'mock-scope',
      isSuperAdmin: false,
      isDataAdmin: false,
      isInternalRequest: false,
      ...token,
    },
  }),
});

describe('requireSub', () => {
  it('should return the token sub when present', () => {
    const requestData = buildRequestData({ sub: 'auth|123' });
    expect(requireSub(requestData)).toBe('auth|123');
  });

  it('should throw a 401 ErrorResponse when the token is missing', () => {
    const requestData = buildRequestData();
    expect(() => requireSub(requestData)).toThrow(ErrorResponse);
    try {
      requireSub(requestData);
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorResponse);
      expect((error as ErrorResponse).status).toBe(StatusCodes.UNAUTHORIZED);
      expect((error as ErrorResponse).message).toBe('Token subject is missing');
    }
  });

  it('should throw a 401 ErrorResponse when sub is undefined', () => {
    const requestData = buildRequestData({ sub: undefined });
    expect(() => requireSub(requestData)).toThrow('Token subject is missing');
  });

  it('should throw a 401 ErrorResponse when sub is empty', () => {
    const requestData = buildRequestData({ sub: '' });
    expect(() => requireSub(requestData)).toThrow('Token subject is missing');
  });
});

describe('getSubject', () => {
  it('should return the email when present', () => {
    const requestData = buildRequestData({ sub: 'auth|123', email: 'user@example.com', client_id: 'client-1' });
    expect(getSubject(requestData)).toBe('user@example.com');
  });

  it('should return the client_id for a client_credentials token', () => {
    const requestData = buildRequestData({ sub: 'service-account-uuid', client_id: 'client-1', gty: 'client_credentials' });
    expect(getSubject(requestData)).toBe('client-1');
  });

  it('should ignore the email of a client_credentials token', () => {
    // A service account's email belongs to the IdP's record for it, not to a person: honouring it
    // would let an IdP-side edit move the machine's Entitlements.
    const requestData = buildRequestData({
      sub: 'service-account-uuid',
      email: 'service-account-client-1@placeholder.org',
      client_id: 'client-1',
      gty: 'client_credentials',
    });
    expect(getSubject(requestData)).toBe('client-1');
  });

  it('should fall back to sub when a client_credentials token carries no client_id', () => {
    const requestData = buildRequestData({ sub: 'service-account-uuid', gty: 'client_credentials' });
    expect(getSubject(requestData)).toBe('service-account-uuid');
  });

  it('should ignore the client_id of an interactive token', () => {
    // The regression this guards: an IdP that omits `email` from access tokens used to collapse
    // every user of the app into the one shared Subject `client-1`.
    const requestData = buildRequestData({ sub: 'auth|123', client_id: 'client-1', gty: 'authorization_code' });
    expect(getSubject(requestData)).toBe('auth|123');
  });

  it('should ignore the client_id when the token carries no grant type', () => {
    // Most IdPs emit no grant claim; an unrecognised caller is treated as a person.
    const requestData = buildRequestData({ sub: 'auth|123', client_id: 'client-1' });
    expect(getSubject(requestData)).toBe('auth|123');
  });

  it('should not treat the hyphenated Auth0 spelling as a client_credentials grant', () => {
    const requestData = buildRequestData({ sub: 'auth|123', client_id: 'client-1', gty: 'client-credentials' });
    expect(getSubject(requestData)).toBe('auth|123');
  });

  it('should prefer the email over the sub for an interactive token', () => {
    const requestData = buildRequestData({ sub: 'auth|123', email: 'user@example.com', gty: 'authorization_code' });
    expect(getSubject(requestData)).toBe('user@example.com');
  });

  it('should fall back to sub when email and client_id are missing', () => {
    const requestData = buildRequestData({ sub: 'auth|123' });
    expect(getSubject(requestData)).toBe('auth|123');
  });

  it.each(['', '  '])('should fall back to sub when the email is blank (%p)', email => {
    // The regression this guards: a provider that sends an empty `email` used to collapse every
    // person into the one shared Subject ''.
    const requestData = buildRequestData({ sub: 'auth|123', email });
    expect(getSubject(requestData)).toBe('auth|123');
  });

  it('should keep any other email exactly as sent', () => {
    // Trimming it would move the Subject, and with it every grant already keyed by the email
    const requestData = buildRequestData({ sub: 'auth|123', email: ' user@example.com' });
    expect(getSubject(requestData)).toBe(' user@example.com');
  });

  it('should throw a 401 ErrorResponse when the token sub is missing', () => {
    const requestData = buildRequestData({ sub: undefined, email: 'user@example.com' });
    expect(() => getSubject(requestData)).toThrow(ErrorResponse);
  });

  it('should throw a 401 ErrorResponse when the token is missing', () => {
    const requestData = buildRequestData();
    expect(() => getSubject(requestData)).toThrow(ErrorResponse);
  });
});

describe('requireEmailSubject', () => {
  const statusOf = (requestData: RequestData): number | undefined => {
    try {
      requireEmailSubject(requestData, 'test');
    } catch (error) {
      return (error as ErrorResponse).status;
    }
    return undefined;
  };

  it("should return a person's email exactly as sent, the same as their Subject", () => {
    const requestData = buildRequestData({ sub: 'auth|123', email: ' user@example.com' });
    expect(requireEmailSubject(requestData, 'test')).toBe(getSubject(requestData));
  });

  it.each([
    ['no email', { sub: 'auth|123' }],
    ['a blank email', { sub: 'auth|123', email: '  ' }],
    ['a Machine caller, even with an email', { sub: 'sa-uuid', client_id: 'client-1', gty: 'client_credentials', email: 'sa@example.com' }],
  ])('should throw a 403 with email_required for %s', (_label, token) => {
    const requestData = buildRequestData(token);
    expect(statusOf(requestData)).toBe(StatusCodes.FORBIDDEN);
    expect(() => requireEmailSubject(requestData, 'test')).toThrow(expect.objectContaining({ extensions: { email_required: true } }));
  });

  it('should throw a 401 when the token is missing', () => {
    expect(statusOf(buildRequestData())).toBe(StatusCodes.UNAUTHORIZED);
  });
});

describe('datasetCapabilities', () => {
  const grants = { datasets: { 'granted-dataset': [Capability.PREVIEW] } };

  it('gives preview and download on a public Dataset without a grant', () => {
    const requestData = buildRequestData({ sub: 'auth|123' });
    expect(datasetCapabilities(requestData, { slug: 'some-dataset', visibility: 'public' })).toEqual([
      Capability.PREVIEW,
      Capability.DOWNLOAD,
    ]);
  });

  it('gives the grants held on a private Dataset', () => {
    const requestData = { ...buildRequestData({ sub: 'auth|123' }), entitlements: grants };
    expect(datasetCapabilities(requestData, { slug: 'granted-dataset', visibility: 'private' })).toEqual([Capability.PREVIEW]);
    expect(datasetCapabilities(requestData, { slug: 'other-dataset', visibility: 'private' })).toEqual([]);
  });

  it('gives a privileged caller preview and download on a private Dataset without a grant', () => {
    const requestData = buildRequestData({ sub: 'auth|123', isDataAdmin: true });
    expect(datasetCapabilities(requestData, { slug: 'other-dataset', visibility: 'private' })).toEqual([
      Capability.PREVIEW,
      Capability.DOWNLOAD,
    ]);
  });
});
