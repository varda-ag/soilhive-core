# State Management

The app uses three layers of state. Choosing the right one keeps components simple and avoids unnecessary re-renders.

## Decision guide

| Question | Answer | Use |
|---|---|---|
| Does this data come from the backend? | Yes | TanStack React Query |
| Is this shared across many components? | Yes | React Context |
| Is this local to one component or subtree? | Yes | `useState` / `useReducer` |

Never put API response data into a Context manually — React Query already caches it and shares it across the tree through the `QueryClientProvider`.

---

## TanStack React Query

React Query manages all server state: fetching, caching, background refetching, and deduplication. The global `QueryClient` is created in `App.tsx` and shared through `QueryClientProvider`.

**Stale time** is set to 10 minutes (`QUERY_STALE_TIME` in `src/configuration/api.ts`). Data fetched within that window is served from cache without a network round-trip.

Use the project's wrapper hooks rather than `useQuery`/`useMutation` directly:

- `useApiQuery` — for GET and POST queries (see [api-integration.md](api-integration.md))
- `useApiMutation` — for POST, PUT, PATCH, DELETE mutations

### Invalidating cache after a mutation

```ts
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();
const mutation = useApiMutation({ endpoint: '/datasets', method: 'POST' });

mutation.mutate(payload, {
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['datasets'] });
  },
});
```

### React Query DevTools

The DevTools panel is included in development builds. Open it with the floating button in the bottom-right corner to inspect cached queries, their status, and last-fetched data.

---

## React Context

Six contexts carry shared application state. Each has a dedicated hook for access — never import context objects directly.

### AvailabilityContext

**File:** `src/contexts/AvailabilityContext.tsx`  
**Hook:** `useAvailability()` from `src/hooks/useAvailability.ts`

Holds the state of the data explorer: selected datasets, text search, applied filters, and the current download selection. This context is consumed by the filtering sidebar, the dataset list, and the download preview simultaneously.

Key values:

| Value | Type | Description |
|---|---|---|
| `selectedDatasets` | `AvailabilityDataset[]` | Datasets currently selected for download |
| `searchValue` | `string` | Free-text search string |
| `datasetFilters` | `DatasetFrontendFilters` | Applied filter state |
| `appliedFiltersCount` | `number` | Badge count shown on the filter button |

### AvailabilityMapContext

**File:** `src/contexts/AvailabilityMapContext.tsx`  
**Hook:** `useAvailabilityMap()` from `src/hooks/useAvailabilityMap.ts`

Holds map-specific state: the current geometry filter drawn by the user, map viewport, and selected geometry features. Updated by user interactions on the map component and consumed by the data-fetching hooks to filter datasets by geography.

Key values:

| Value | Type | Description |
|---|---|---|
| `geometryFilter` | `GeoJSON \| null` | User-drawn polygon used to spatial-filter data |
| `mapViewport` | `Viewport` | Current map center, zoom, bearing |

### ThemeContext

**File:** `src/contexts/ThemeContext.tsx`  
**Hook:** `useTheme()` from `src/hooks/useTheme.ts`

Loads branding and content configuration from the backend (`/config/theme`). Provides colors, terms and conditions HTML, privacy policy HTML, the initial map bounding box, and the notification banner config. Used by the layout and any component that needs brand-aware defaults.

### DownloadsContext

**File:** `src/contexts/DownloadsContext.tsx`  
**Hook:** `useDownloads()` (via `src/hooks/useDownloads.ts`)

Tracks in-progress and historical download jobs. Components subscribe to this to show a download status indicator in the header and the downloads history panel.

### NotificationsContext

**File:** `src/contexts/NotificationsContext/index.tsx`  
**Hook:** `useNotifications()` from `src/hooks/useNotifications.ts`

Manages a queue of toast/banner notifications. The HTTP client and mutation hooks call `showNotification` automatically on network errors; components can also call it directly.

```ts
const { showNotification } = useNotifications();

showNotification({
  id: 'save_success',
  type: 'success',
  title: 'Saved',
  message: 'Your changes have been saved.',
});
```

Notification types: `'success' | 'error' | 'warning' | 'info'`.

### LookAndFeelContext

**File:** `src/contexts/LookAndFeelContext.tsx`  
**Hook:** `useLookAndFeel()` from `src/hooks/useLookAndFeel.ts`

Manages the admin-controlled branding customization: logo upload and color palette. Changes here are written to the backend and immediately reflected in `ThemeContext`. Only used inside the admin portal.

---

## Local component state

Use `useState` for anything that is:

- Not shared outside the component or a small subtree
- Not fetched from the backend
- Purely UI-level (open/closed, form field values, hover state)

```ts
const [isOpen, setIsOpen] = useState(false);
const [formValue, setFormValue] = useState('');
```

Use `useReducer` when a component has multiple related state transitions (e.g., a multi-step form wizard).

---

## Common patterns

### Reading data from two sources

Combine a React Query result with context state when filtering server data by user selection:

```ts
const { geometryFilter } = useAvailabilityMap();
const { data: datasets } = useApiQuery({
  endpoint: '/datasets',
  method: 'GET',
  queryKey: ['datasets', geometryFilter],
  enabled: true,
  parameters: geometryFilter ? [['geometry', JSON.stringify(geometryFilter)]] : [],
});
```

### Sharing state between sibling components

If two sibling components both need the same piece of state, lift it to their common ancestor or, if they are in different subtrees, put it in an appropriate Context.

### Avoiding context over-use

Do not add new values to an existing context just for convenience. Every consumer of a context re-renders when any value in it changes. If the new value is only needed by one component, keep it in that component's local state or in a custom hook.
