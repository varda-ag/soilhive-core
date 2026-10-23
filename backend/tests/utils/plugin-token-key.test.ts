import { describe, it, expect, beforeEach } from '@jest/globals';
import { deriveEs256Key, getPasswordGrantKey } from '../../src/utils/password-grant-key';
import {
  getAdminPluginIds,
  getPluginTokenIssuer,
  getPluginTokenKey,
  pluginIdFromAudience,
  pluginTokenScope,
} from '../../src/utils/plugin-token-key';

const SECRET = 'a-plugin-token-secret-of-at-least-32-characters';

describe('plugin-token-key', () => {
  beforeEach(() => {
    process.env.PLUGIN_TOKEN_SECRET = SECRET;
  });

  it('derives a fixed key from PLUGIN_TOKEN_SECRET', () => {
    // Pinned: any change to the derivation rotates the key, and Plugin Backends reject the tokens in use
    expect(getPluginTokenKey()!.jwk).toEqual({
      kty: 'EC',
      crv: 'P-256',
      x: 'NqNEXn1ucmH9na8SrsXkcNAu6W58HXNUW-obVslVY1c',
      y: 'sc747HfdqIEWQtwUJiNxABYqEEqNkpgNOjad-N4RKnE',
      kid: 'Yyz1jpQ531M4w7unIJ4pczf_yVqWGt1ys7-nmIA_Z_w',
      use: 'sig',
      alg: 'ES256',
    });
  });

  it('never matches the password-grant key, even from the same secret', () => {
    process.env.SELF_SIGNING_SECRET = SECRET;
    expect(getPluginTokenKey()!.kid).not.toBe(getPasswordGrantKey().kid);
    expect(deriveEs256Key(SECRET, 'plugin-token-es256').kid).toBe(getPluginTokenKey()!.kid);
  });

  it.each([
    ['unset', undefined],
    ['shorter than 32 characters', 'x'.repeat(31)],
  ])('gives no key, without throwing, when the secret is %s', (_, secret) => {
    if (secret === undefined) {
      delete process.env.PLUGIN_TOKEN_SECRET;
    } else {
      process.env.PLUGIN_TOKEN_SECRET = secret;
    }
    expect(getPluginTokenKey()).toBeUndefined();
  });

  it.each([
    ['https://api.example/api/v1/', 'https://api.example/api/v1'],
    ['http://localhost:4001/api/v1', 'http://localhost:4001/api/v1'],
    [' https://api.example/api/v1/\n', 'https://api.example/api/v1'],
    [undefined, undefined],
    ['  ', undefined],
    ['not a url', undefined],
    ['ftp://api.example', undefined],
    ['https://user:pass@api.example', undefined],
    ['https://api.example/api/v1?x=1', undefined],
  ])('reads CORE_PUBLIC_URL %p as the issuer %p', (value, issuer) => {
    if (value === undefined) {
      delete process.env.CORE_PUBLIC_URL;
    } else {
      process.env.CORE_PUBLIC_URL = value;
    }
    expect(getPluginTokenIssuer()).toBe(issuer);
  });

  it('lists the admin plugins, ignoring blanks and invalid ids', () => {
    process.env.PLUGIN_TOKEN_ADMIN_PLUGINS = ' zones , ,bad id,other.plugin_1';
    expect([...getAdminPluginIds()]).toEqual(['zones', 'other.plugin_1']);
    delete process.env.PLUGIN_TOKEN_ADMIN_PLUGINS;
    expect(getAdminPluginIds().size).toBe(0);
  });

  it.each([
    ['plugin:zones', 'zones'],
    ['plugin:', undefined],
    ['zones', undefined],
    ['plugin:bad id', undefined],
    [['plugin:zones'], undefined],
    [undefined, undefined],
  ])('reads the pluginId of the audience %p as %p', (aud, pluginId) => {
    expect(pluginIdFromAudience(aud)).toBe(pluginId);
  });

  it.each([
    ['super-admin data-admin', 'super-admin data-admin'],
    ['data-admin internal-request', 'data-admin'],
    ['super-admin-ish user', ''],
    [['openid', 'data-admin', 'internal-request'], 'data-admin'],
    [undefined, ''],
  ])('keeps only the whole admin scopes of %p', (scope, kept) => {
    expect(pluginTokenScope(scope)).toBe(kept);
  });
});
