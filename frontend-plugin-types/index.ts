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

// Passed as a single prop to plugin components, rather than via a shared MF
// singleton Context, so plugins don't depend on host/plugin module-instance
// identity for anything in here. Grows as more host state is exposed.
export interface PluginContext {
  user?: PluginUser | null;
}
