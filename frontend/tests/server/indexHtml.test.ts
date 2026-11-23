import { anchorRelativeUrls } from '../../server/indexHtml';

// Shaped like the built dist/client/index.html (assetPrefix 'auto').
const builtHtml = [
  '<link rel="icon" href="favicon.ico">',
  '<script defer src="static/js/index.abc.js"></script>',
  '<link href="static/css/index.abc.css" rel="stylesheet">',
  '<script src="/env-config.js"></script>',
].join('');

it('anchors every relative src and href at the base path', () => {
  expect(anchorRelativeUrls(builtHtml, '/app')).toBe(
    [
      '<link rel="icon" href="/app/favicon.ico">',
      '<script defer src="/app/static/js/index.abc.js"></script>',
      '<link href="/app/static/css/index.abc.css" rel="stylesheet">',
      '<script src="/env-config.js"></script>',
    ].join(''),
  );
});

it('anchors them at the domain root when there is no base path', () => {
  expect(anchorRelativeUrls(builtHtml, '')).toBe(
    [
      '<link rel="icon" href="/favicon.ico">',
      '<script defer src="/static/js/index.abc.js"></script>',
      '<link href="/static/css/index.abc.css" rel="stylesheet">',
      '<script src="/env-config.js"></script>',
    ].join(''),
  );
});

it.each([
  ['an absolute path', '<script src="/env-config.js">'],
  ['a URL with a scheme', '<link href="https://fonts.example.com/a.css">'],
  ['a data URL', '<link rel="icon" href="data:,">'],
  ['a protocol-relative URL', '<script src="//cdn.example.com/a.js">'],
  ['a fragment', '<a href="#main">'],
  ['an empty value', '<a href="">'],
  ['an attribute that only ends in src', '<img data-src="static/a.png">'],
])('leaves %s as it is', (_name, html) => {
  expect(anchorRelativeUrls(html, '/app')).toBe(html);
});
