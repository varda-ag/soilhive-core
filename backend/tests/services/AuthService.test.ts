import jwt from 'jsonwebtoken';
import AuthService from '../../src/services/AuthService';

describe('Testing AuthService', () => {
  beforeEach(() => {
    const service = new AuthService();
    service.resetAuthConfig();
  });
  it('Ensure password mode is set when requesting a token', () => {
    const service = new AuthService();
    process.env.SUPER_ADMIN_PASSWORD_HASH = '';
    expect(() => service.getToken('')).toThrow(
      expect.objectContaining({ message: 'Platform is not configured for password authentication' }),
    );
  });

  it('Requesting a token using a wrong password', () => {
    const service = new AuthService();
    expect(() => service.getToken('wrong')).toThrow(expect.objectContaining({ message: 'Invalid password' }));
  });

  it.each([
    [
      'superadmin',
      {
        sub: 'super-admin',
        scope: 'super-admin',
        email_verified: true,
        given_name: 'super',
        family_name: 'admin',
        name: 'super admin',
        email: 'super-admin@localhost',
      },
    ],
    [
      'dataadmin',
      {
        sub: 'data-admin',
        scope: 'data-admin',
        email_verified: true,
        given_name: 'data',
        family_name: 'admin',
        name: 'data admin',
        email: 'data-admin@localhost',
      },
    ],
  ])('Requesting a token using a valid password', (password: string, expectedTokenClaims: any) => {
    const service = new AuthService();
    const token = service.getToken(password);
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded).toBeDefined();
    expect(decoded!.payload).toMatchObject(expectedTokenClaims);
  });
});
