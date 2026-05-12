# Hooks Reference

All custom hooks live in `src/hooks/`. They are the primary interface for accessing API data, context state, and reusable behaviour. Prefer hooks over direct context imports or `useQuery`/`useMutation` calls.

---

## API hooks

### `useApiQuery`
Generic wrapper around TanStack `useQuery`. Handles URL construction, in-flight deduplication, and optional error notifications. See [api-integration.md](api-integration.md) for full options.

### `useApiQueries`
Wrapper around TanStack `useQueries` for running multiple queries in parallel with a single hook call.

### `useApiMutation`
Generic wrapper around TanStack `useMutation` for POST, PUT, PATCH, DELETE. See [api-integration.md](api-integration.md).

### `useRequest`
Imperative hook for one-shot requests with `loading` / `error` state. Use when `useApiQuery` / `useApiMutation` don't fit (e.g. file uploads). See [api-integration.md](api-integration.md).

---

## Context accessor hooks

These hooks read from their respective React Contexts. Using them (rather than `useContext` directly) ensures a clear error message if the hook is called outside the provider tree.

### `useAvailability()`
Returns the full `AvailabilityContext` value. Contains selected datasets, search string, applied filters, and filter counts.

### `useAvailabilityMap()`
Returns the `AvailabilityMapContext` value. Contains the geometry filter drawn by the user and the current map viewport.

### `useTheme()`
Returns `ThemeContext`: brand colors, terms HTML, privacy HTML, initial map bounding box, and notification banner config.

### `useNotifications()`
Returns `{ showNotification, dismissNotification }` from `NotificationsContext`. Call `showNotification` to display a toast from any component.

### `useLookAndFeel()`
Returns `LookAndFeelContext`: logo URL, current colors, and mutations for saving changes. Only used in the admin portal.

---

## Data fetching hooks

Each of these wraps `useApiQuery` with a specific endpoint and query key.

### `useDatasets(params?)`
Fetches the paginated/filtered list of published datasets from `/datasets`. Accepts optional filter parameters.

### `useMetadata(id)`
Fetches and enriches a single dataset by id. Combines the `/datasets/:id` response with `/licenses` and `/soil-properties` to produce a display-ready metadata object.

### `useSoilProperties()`
Fetches the list of soil properties from `/soil-properties`. Used widely in filter UIs and dataset forms.

### `useConfig(id)`
Fetches a theme config object from `/config/:id`.

### `useDataFilterQuery(filters)`
Fires a filtered dataset query against the backend based on the current filter state from `AvailabilityContext` and geometry from `AvailabilityMapContext`.

### `useFilteredDatasetsQuery(filters)`
Fetches datasets filtered by the current availability filters. Used to populate the datasets sidebar.

### `useFilteredCoverageQuery(filters)`
Fetches geographic coverage data matching the current filters. Used to render the coverage layer on the map.

### `useDownloads()`
Fetches the current user's download history from `/downloads`.

### `useJobsApi()`
Fetches and polls job statuses from `/jobs`. Used by `DownloadsStatus` to track in-progress jobs.

### `useDatasetEntitlements(datasetId)`
Fetches the access entitlements for a specific dataset for the current user.

### `useEntitlementsHook()`
Decodes the current JWT and returns `{ isAdmin, entitlements }`. Used by route guards and permission checks. Does not make a network request.

---

## Feature hooks

These hooks encapsulate a feature's state and API calls together.

### `useDataScopeFilters()`
Manages the complete state of the data scope filter panel: time range, dataset type, and access type filters. Returns filter state, selection pills for the active filters, option lists, and change handlers.

### `useDownloadPreview()`
Drives the download preview panel. Fetches coverage data for the selected datasets and geometry, computes the dataset summary (data points, layers, depth ranges), and returns display-ready data.

### `useDownloadSummary()`
Fetches the summary for a completed or in-progress download. Used on the Download Summary page.

### `useDatasetsPublicationList()`
Admin-only. Fetches the full list of datasets for the admin portal table, including unpublished ones. Provides mutations for creating, updating, and deleting datasets.

### `useDatasetsSettings(datasetId)`
Fetches and manages settings for a specific dataset (visibility, publication status, etc.).

### `useDatasetsSoilData(datasetId)`
Fetches and manages the soil data configuration for a dataset during the publication wizard.

### `useGeneralInfoForm(datasetId?)`
Manages the General Info step of the dataset publication wizard. Returns form state, field handlers, and a submit mutation.

### `useMappingsStep(datasetId)`
Manages the Mappings step of the publication wizard. Handles column-to-property mapping state and the submit mutation.

### `useSoilData(datasetId)`
Manages the Soil Data step. Returns current soil data config, update handlers, and validity state.

### `useRaster(datasetId?)`
Fetches raster-specific data for a dataset.

### `useRasterFilters()`
Manages raster filter state for the map-based filters admin page.

### `usePropertiesCategories()`
Groups soil properties into display categories for filter UIs.

### `useSoilPropertiesFilters()`
Manages the soil properties filter selection in the availability explorer.

### `useMetadataMutation(datasetId)`
Provides a mutation for updating dataset metadata fields.

### `useCreateMappingsMutation(datasetId)`
Provides a mutation for submitting column mappings during the publication wizard.

### `useCreateProcedureMutation(datasetId)`
Provides a mutation for triggering ingestion procedures after mappings are saved.

### `useFileManagement(datasetId)`
Manages file upload/delete state for the dataset publication wizard.

### `useFileUpload()`
Generic file upload hook. Wraps `useRequest` with multipart FormData handling and upload progress tracking.

---

## UI hooks

### `useDevice()`
Returns the current breakpoint (`'mobile' | 'tablet' | 'desktop'`) based on window width. Subscribes to resize events.

### `useDebounce(value, delay)`
Returns a debounced version of `value`. Used in search inputs to avoid firing a query on every keystroke.

### `useDialogDismiss(ref, onDismiss)`
Calls `onDismiss` when the user clicks outside the `ref` element or presses Escape. Used by custom modal/dropdown components.

### `useOnceDefined(value)`
Returns the first non-null/undefined value seen. Useful for locking an initial value that might briefly be undefined during loading.
