# API Integration

All HTTP communication goes through a thin client stack. The layers are:

```
useApiQuery / useApiMutation / useRequest
        │
        ▼
    httpClient          ← fetch wrapper, adds Bearer token, parses response
        │
        ▼
   Backend API
```

---

## httpClient

**File:** `src/api-client/httpClient.ts`

The base fetch wrapper. It:

- Reads the JWT token from `tokenStore` and attaches `Authorization: Bearer <token>` to every request.
- Sets `Content-Type: application/json` automatically when the body is not `FormData`.
- Parses the response as JSON, Blob, or throws a typed error depending on `Content-Type`.
- Throws a descriptive error when `BACKEND_BASE_URL` is misconfigured (e.g. the server returns `text/html` instead of `application/json`).

You will almost never call `httpClient` directly. Use the hooks below instead.

---

## useApiQuery — cached GET / POST

**File:** `src/hooks/useApiQuery.ts`

Wraps TanStack `useQuery`. Use this for any data you want cached and automatically refetched.

```ts
const { data, isLoading, error } = useApiQuery<Dataset[]>({
  endpoint: '/datasets',
  method: 'GET',
  queryKey: ['datasets'],
  enabled: true,
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | required | Backend path, relative to `BACKEND_BASE_URL` |
| `method` | `'GET' \| 'POST'` | required | HTTP method |
| `body` | `TBody` | — | Request body (for POST queries) |
| `parameters` | `Array<[string, string]>` | — | Query string parameters as pairs (allows duplicate keys) |
| `queryKey` | `QueryKey` | required | React Query cache key |
| `enabled` | `boolean` | required | Whether to run the query |
| `refetchInterval` | `number \| false` | — | Polling interval in ms |
| `retry` | `boolean \| number` | — | Override default retry behaviour |
| `showErrorNotification` | `boolean` | `true` | Show a toast on error |
| `notFoundAsNull` | `boolean` | `false` | Return `null` instead of throwing on 404 |
| `isBlobResponse` | `boolean` | `false` | Parse response as `Blob` |
| `abortOnNewQuery` | `boolean` | `false` | Abort in-flight request when a new query fires |

### Deduplication

`useApiQuery` deduplicates concurrent requests with identical URL + method + body. If two components mount simultaneously and both trigger the same query, only one network request is made and both components share the response.

### Parameters with duplicate keys

Use the `parameters` array instead of embedding query strings in `endpoint`:

```ts
// Multiple values for the same key
parameters: [
  ['type', 'raster'],
  ['type', 'vector'],
]
// Produces: /datasets?type=raster&type=vector
```

---

## useApiMutation — POST / PUT / PATCH / DELETE

**File:** `src/hooks/useApiMutation.ts`

Wraps TanStack `useMutation`. Use this for writes.

```ts
const mutation = useApiMutation<DatasetResponse, CreateDatasetPayload>({
  endpoint: '/datasets',
  method: 'POST',
});

mutation.mutate(payload, {
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['datasets'] });
  },
  onError: (error) => {
    console.error(error);
  },
});
```

The `endpoint` can be a function when it depends on the mutation variables:

```ts
const mutation = useApiMutation<void, string>({
  endpoint: (id) => `/datasets/${id}`,
  method: 'DELETE',
});

mutation.mutate(datasetId);
```

---

## useRequest — imperative one-shot requests

**File:** `src/api-client/useRequest.ts`

Use this for requests that are triggered imperatively (e.g. file uploads, form submissions that don't fit the React Query model) and when you need granular `loading` / `error` state.

```ts
const { request, loading, error } = useRequest<UploadResponse>();

const handleUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const result = await request({
    url: `${BACKEND_BASE_URL}/upload`,
    method: 'POST',
    body: formData,
  });
};
```

`useRequest` automatically shows a toast notification on network errors unless `showErrorNotification: false` is passed in the config. A timeout-like error gets a `'warning'` severity instead of `'error'`.

---

## URL construction

**File:** `src/utilities/buildApiUrl.ts`

```ts
import { buildApiUrl } from 'utilities/buildApiUrl';

const url = buildApiUrl('/datasets', [['status', 'published']]);
// → 'http://localhost:4001/datasets?status=published'
```

`useApiQuery` calls `buildApiUrl` internally, so you only need this directly when using `useRequest`.

The base URL (`BACKEND_BASE_URL`) comes from `src/configuration/api.ts`, which reads `window._env_.BACKEND_BASE_URL` at runtime.

---

## Adding a new API endpoint

### Read endpoint (cached)

1. Create a hook in `src/hooks/useMyData.ts`:

```ts
import { useApiQuery } from './useApiQuery';

export function useMyData(id: string) {
  return useApiQuery<MyDataType>({
    endpoint: `/my-resource/${id}`,
    method: 'GET',
    queryKey: ['my-resource', id],
    enabled: !!id,
  });
}
```

2. Use it in a component:

```ts
const { data, isLoading } = useMyData(id);
```

### Write endpoint (mutation)

```ts
import { useApiMutation } from './useApiMutation';
import { useQueryClient } from '@tanstack/react-query';

export function useCreateMyResource() {
  const queryClient = useQueryClient();

  const mutation = useApiMutation<MyDataType, CreatePayload>({
    endpoint: '/my-resource',
    method: 'POST',
  });

  const create = (payload: CreatePayload) =>
    mutation.mutate(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['my-resource'] });
      },
    });

  return { create, isLoading: mutation.isPending };
}
```

---

## Error handling

The `httpClient` calls `handleError` (`src/api-client/error.ts`) on non-2xx responses. It:

- Parses the error body and constructs a typed `Error` with a `.status` property.
- Clears the stored auth token on `401 Unauthorized` (forces re-login on next navigation).

`useRequest` catches this error and shows a toast notification by default. To suppress the toast (e.g. when the calling component handles errors itself):

```ts
await request({ url, method: 'GET', showErrorNotification: false });
```

To treat `404` as a valid "not found" rather than an error:

```ts
const result = await request({ url, method: 'GET', notFoundAsNull: true });
// result is null if the resource doesn't exist
```

---

## Backend type definitions

**File:** `src/types/backend.ts`

TypeScript interfaces for all backend response shapes live here. When the backend adds or changes a response shape, update this file and the adapter (`src/adapters/datasetAdapter.ts`) if the frontend type also changes.

Frontend-specific types (derived shapes, UI-only fields) live in `src/types/availability.ts`, `src/types/config.ts`, etc.
