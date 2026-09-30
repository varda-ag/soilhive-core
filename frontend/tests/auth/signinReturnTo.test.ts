import { getCurrentPath, getReturnTo } from '../../src/auth/signinReturnTo';

describe('getCurrentPath', () => {
  it('keeps the path, query and hash', () => {
    window.history.replaceState({}, '', '/dashboards/abc?tab=2#widget-1');

    expect(getCurrentPath()).toBe('/dashboards/abc?tab=2#widget-1');
  });
});

describe('getReturnTo', () => {
  it('returns a same-origin path', () => {
    expect(getReturnTo({ returnTo: '/dashboards/abc?tab=2#w' })).toBe('/dashboards/abc?tab=2#w');
  });

  it.each([
    ['no state', undefined],
    ['a non-object state', 'dashboards'],
    ['no returnTo', {}],
    ['a non-string returnTo', { returnTo: 42 }],
    ['a relative path', { returnTo: 'dashboards' }],
    ['an absolute URL', { returnTo: 'https://evil.example/' }],
    ['a protocol-relative URL', { returnTo: '//evil.example/' }],
    ['a backslash protocol-relative URL', { returnTo: '/\\evil.example/' }],
  ])('rejects %s', (_label, state) => {
    expect(getReturnTo(state)).toBeUndefined();
  });
});
