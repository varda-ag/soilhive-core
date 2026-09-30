import { getCurrentPath, getReturnTo, hasCallbackParams } from '../../src/auth/signinReturnTo';

describe('getCurrentPath', () => {
  it('keeps the path, query and hash', () => {
    window.history.replaceState({}, '', '/dashboards/abc?tab=2#widget-1');

    expect(getCurrentPath()).toBe('/dashboards/abc?tab=2#widget-1');
  });

  it("drops a sign-in callback's params and keeps the rest", () => {
    window.history.replaceState({}, '', '/admin?tab=2&error=access_denied&error_description=denied&state=xyz#w');

    expect(getCurrentPath()).toBe('/admin?tab=2#w');
  });

  it('drops the query when it held only callback params', () => {
    window.history.replaceState({}, '', '/?code=abc&state=xyz&session_state=s&iss=https%3A%2F%2Fidp.example');

    expect(getCurrentPath()).toBe('/');
  });

  it('keeps an app param that only shares its name with a callback param', () => {
    window.history.replaceState({}, '', '/dashboards?state=open');

    expect(getCurrentPath()).toBe('/dashboards?state=open');
  });
});

describe('hasCallbackParams', () => {
  it.each([
    ['a successful callback', '/?code=abc&state=xyz', true],
    ['a failed callback', '/?error=access_denied&state=xyz', true],
    ['a lone state', '/?state=open', false],
    ['a lone code', '/?code=abc', false],
    ['no query', '/', false],
  ])('is %s: %s', (_label, url, expected) => {
    window.history.replaceState({}, '', url);

    expect(hasCallbackParams()).toBe(expected);
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
