# Server-Side Rendering

SoilHive uses SSR selectively: only specific routes are server-rendered. All other routes use the standard SPA client.

## Why selective SSR

Full SSR is complex and costly to maintain. The app only uses it where it produces clear value — the `/datasets/:id` metadata page — because:

- Search engines and social sharing crawlers need pre-rendered HTML to index dataset metadata and generate link previews.
- Every other page is an interactive data explorer where first-paint performance is less critical.

---

## Architecture

Two Rsbuild environments are built in parallel (`rsbuild.config.ts`):

| Environment | Entry | Output | Target |
|---|---|---|---|
| `web` | `src/index.tsx` | `dist/client/` | Browser |
| `ssr` | `server/index.ts` | `dist/server/index.cjs` | Node.js |

The SSR build bundles `server/index.ts` together with `src/entry-server.tsx` into a single CommonJS file that Express executes.

---

## Request lifecycle

```
Browser → GET /datasets/abc
          │
          ▼
   Express (server/index.ts)
          │
          ├─ matchSSRRoute('/datasets/abc') → '/datasets/:id' ✓
          ├─ resolveAuthToken(req) → JWT or null
          │
          ▼
   render(url, { authToken })   ← entry-server.tsx
          │
          ├─ prefetchQuery(['dataset', 'abc'])
          ├─ prefetchQuery(['licenses'])
          ├─ prefetchQuery(['soilProperties'])
          ├─ prefetchQuery(['/config/theme'])
          │
          ▼
   renderToString(<MetadataPage />)
          │
          ▼
   indexHtml
     .replace('#root' outlet → ssrContent)
     .replace env-config.js → inline window._env_
     .replace <!--ssr-head--> → <title>Dataset Name</title> + OG tags
     .inject window.__REACT_QUERY_STATE__ = dehydratedState
          │
          ▼
   200 text/html with full page
```

For non-SSR routes, Express serves `index.html` directly and the SPA boots in the browser.

---

## Client-side hydration

`src/index.tsx` checks whether the `#root` element has the `data-ssr-page` attribute set by the server:

```ts
const root = document.getElementById('root');
const ssrPage = root?.dataset.ssrPage;   // e.g. '/datasets/:id'

if (ssrPage) {
  // hydration path: React attaches event handlers to existing DOM
  hydrateRoot(root, <SSRComponent />);
} else {
  // SPA path: React renders from scratch
  createRoot(root).render(<App />);
}
```

The SSR components also hydrate React Query's cache from `window.__REACT_QUERY_STATE__` using React Query's `HydrationBoundary`, so no duplicate API requests are made after hydration.

---

## Adding an SSR route

1. **Create the page component** — design it to work in both server (no browser APIs) and client contexts.

2. **Register it in `SSR_ROUTES`** (`src/entry-server.tsx`):

```ts
const SSR_ROUTES: Record<string, React.ComponentType> = {
  '/datasets/:id': MetadataPage,
  '/my-new-route/:id': MyNewPage,   // add here
};
```

3. **Prefetch required data** in the `render` function, alongside the existing `datasetMatch` block:

```ts
const myMatch = matchedPattern === '/my-new-route/:id'
  ? pathname.match(/^\/my-new-route\/([^/]+)$/)
  : null;

if (myMatch) {
  const resourceId = myMatch[1];
  await queryClient.prefetchQuery({
    queryKey: ['my-resource', resourceId],
    queryFn: async () => {
      const res = await fetch(`${backendUrl}/my-resource/${resourceId}`, { headers: buildHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}
```

4. **Use the same query key** in the page component's hook so the hydrated cache is picked up without a refetch:

```ts
// In the page component
const { data } = useApiQuery({
  endpoint: `/my-resource/${id}`,
  queryKey: ['my-resource', id],   // must match prefetch key exactly
  enabled: !!id,
  method: 'GET',
});
```

5. **Handle missing browser APIs** — code that runs during `renderToString` cannot use `window`, `document`, `localStorage`, `URL.createObjectURL`, or any other browser-only API. Guard these with `typeof window !== 'undefined'` or move them into `useEffect`.

---

## SEO and `<head>` injection

The server injects page-specific `<head>` content by replacing the `<!--ssr-head-->` comment in `index.html`.

`buildMetadataHeadHtml` (`src/utilities/buildMetadataHead.ts`) generates the `<title>` tag and OpenGraph meta tags for dataset pages. To add head content for a new SSR route, call this utility (or write a new one) and pass the result as the `head` field in the object returned from `render()`.

---

## SSR fallback

If `renderToString` throws for any reason, the Express server catches the error, logs it, and falls back to serving the plain `index.html` SPA shell. The user sees the app; they just don't get the pre-rendered HTML or SEO tags. This prevents a broken SSR component from taking the entire page down.

---

## i18n in SSR

The browser version loads translations asynchronously via HTTP. The SSR build cannot do this — `renderToString` is synchronous. Instead, `entry-server.tsx` imports the English JSON files directly and initialises i18next synchronously before rendering:

```ts
import adminTranslations from '../public/locales/en/admin.json';
import commonTranslations from '../public/locales/en/common.json';
import metadataTranslations from '../public/locales/en/metadata.json';

i18n.use(initReactI18next).init({
  resources: { en: { admin: adminTranslations, ... } },
  lng: 'en',
});
```

Only English is served from the SSR pass. If multi-language SSR is needed in the future, translation files for each locale would need to be imported and the language resolved from the request's `Accept-Language` header.
