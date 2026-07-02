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

  it('should fall back to client_id when email is missing', () => {
    const requestData = buildRequestData({ sub: 'auth|123', client_id: 'client-1' });
    expect(getSubject(requestData)).toBe('client-1');
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
