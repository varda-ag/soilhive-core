import { describe, it, expect } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import { EntityManager } from 'typeorm';
import { requireSub, getSubject } from '../../src/utils/auth';
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

  it('should throw a 401 ErrorResponse when the token sub is missing', () => {
    const requestData = buildRequestData({ sub: undefined, email: 'user@example.com' });
    expect(() => getSubject(requestData)).toThrow(ErrorResponse);
  });

  it('should throw a 401 ErrorResponse when the token is missing', () => {
    const requestData = buildRequestData();
    expect(() => getSubject(requestData)).toThrow(ErrorResponse);
  });
});
