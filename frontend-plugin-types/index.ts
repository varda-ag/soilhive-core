// Types-only contract shared between the host (frontend) and plugins
// (e.g. frontend-plugin-example). Imported via `import type`, so it never
// ships any runtime code — no MF singleton registration needed for this
// package, unlike frontend-hooks.
//
// Deliberately a thin, stable subset of the host's internal auth user shape
// (frontend/src/auth/Token.tsx), not a re-export of it: plugins depend on
// this contract, not on how the host's auth implementation represents a user.
export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
}

// Deliberately thin, plugin-facing subset of the host's internal Dataset type
// (frontend/src/types/backend.ts), which also carries backend-internal
// fields (status, created_by, service_location, capabilities, visibility...)
// that plugins have no business depending on.
export interface PluginDataset {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface PluginQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

// Passed as a single prop to plugin components, rather than via a shared MF
// singleton Context, so plugins don't depend on host/plugin module-instance
// identity for anything in here. Grows as more host state is exposed.
//
// `useDatasets` is a function value, not a snapshot: the plugin calls it
// during its own render, and it resolves against the host's react-query
// instance (the same shared react/react-dom already required to render the
// plugin's component at all) — so it stays reactive without frontend-hooks
// or @tanstack/react-query needing to be MF singletons. See
// docs/frontend/plugin-context-props.md.
export interface PluginContext {
  user?: PluginUser | null;
  useDatasets?: () => PluginQueryResult<PluginDataset[]>;
}
