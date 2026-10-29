import { resolveOwnPagePath } from 'utilities/ownPagePath';

describe('resolveOwnPagePath', () => {
  it.each<[string | undefined, string]>([
    [undefined, '/dashboards'],
    ['', '/dashboards'],
    ['new', '/dashboards/new'],
    ['./new', '/dashboards/new'],
    ['new?filterId=a', '/dashboards/new?filterId=a'],
    ['?filterId=a', '/dashboards?filterId=a'],
    ['a/b#top', '/dashboards/a/b#top'],
  ])('resolves %p under the plugin route to %p', (subPath, expected) => {
    expect(resolveOwnPagePath('dashboards', subPath)).toBe(expected);
  });

  it.each(['/admin', '../admin', '..', 'new/../../admin', '//evil.com', 'https://evil.com/dashboards/new', '/dashboards-other'])(
    'refuses %p, which resolves outside the plugin route',
    subPath => {
      expect(resolveOwnPagePath('dashboards', subPath)).toBeUndefined();
    },
  );
});
