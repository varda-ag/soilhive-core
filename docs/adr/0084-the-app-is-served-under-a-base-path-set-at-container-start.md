# The app is served under a base path set at container start, with the prefix kept

A deployment may share one host between the app and other sites, such as a marketing site at `/` and another app under its own path, so the app has to be servable under a path such as `/app`. `APP_BASE_PATH` (default `/`) sets the path the app is served under. The Node server reads it at start, so one image serves any path: it serves pages and assets under it, puts it in front of the relative URLs in `index.html` (chunks then load from where the script that loaded them came from), sets the server bundle's public path to it, and hands it to the browser in `window._env_` for the router's basename. A value it can't use stops the server, since falling back to `/` would serve a page whose every asset is a 404. The proxy in front forwards requests with the prefix kept, so the server sees the URL the browser sees. `/health` and `/ready` stay at the root for probes, and any other path outside the base path is a 404. `APP_BASE_URL` stays an origin, and a path in it is still ignored with a warning: absolute links are its origin, then the base path, then the in-app path.

## Considered options

- **Setting the path at build time** (`assetPrefix`): rejected. Each path would need its own image, and the published image could only be served at `/`. Every other setting is already read at start.
- **The proxy removing the prefix**: rejected. Every URL Express builds itself, such as a redirect, would need the prefix put back by hand, and the server could not be tried without a proxy in front.
- **Reading the path from `APP_BASE_URL`**: rejected. `APP_BASE_URL` is optional, as the browser falls back to its own origin, but routing needs the path either way.
- **Accepting both, with and without the prefix**: rejected. Two code paths to test, and a URL could mean one thing to the server and another to the browser.

## Consequences

- The `token` cookie is set with `path=` the base path, so another site on the same host never receives a user's token. localStorage has no path, so they still share it. Whenever the app writes its cookie under a base path, it also expires a `token` cookie at `/`, which a host that served the app at its root left behind, so a site at the root can't keep a cookie by that name.
- The consent cookie (`cc_cookie`) stays at `/`, so a site at the host's root that uses vanilla-cookieconsent with the same cookie shares one consent with the app. The two setups must then keep the same cookie name and categories, and `COOKIE_DOMAIN` stays unset if that site's cookie is host-only.
- The OIDC redirect URIs are fixed by the backend's env, so the app must be reached on one host only; other host names redirect to it at the proxy. Redirects for another app's old URLs under the base path live there too: the app knows nothing about them.
- A host that moves the app from its root to a path needs proxy redirects for the app's own old URLs too (`/datasets/*` to `/app/datasets/*`, `/terms-of-use`, `/privacy-policy`, `/admin` and so on). Links already handed out, such as shared pages, bookmarks and the links in past exports' README.pdf, would otherwise be a 404.
- Plugins need no new field: react-router puts the basename in front of their `useNavigate` paths, and `metadataUrl` includes it. A plugin that writes an app path into `href` or `window.location` itself misses it.
