import i18next from 'i18next';

// i18next is a Module Federation singleton: the host owns init(), this plugin only adds its own
// namespace to the shared instance. See
// docs/adr/0031-plugin-i18n-resource-registration-is-a-reusable-helper-not-a-fixed-file.md.
// Guarded with hasResourceBundle so a StrictMode double-render or a Module Federation remount of
// the plugin's exposed entry point can't register a bundle twice or log a duplicate-registration
// warning.
export function registerResourceBundle(namespace: string, resources: object): void {
  // i18next.hasResourceBundle/addResourceBundle are created inside i18next.init() itself, not on
  // the prototype — they don't exist until init() has actually run. This plugin never calls
  // init() itself in its federated entry point (the host must), so if the host mounts this
  // plugin before its own init() call resolves, these methods aren't there yet — degrade
  // silently rather than crash. Same applies in standalone dev mode before i18n.dev.ts has run.
  if (typeof i18next.hasResourceBundle !== 'function' || typeof i18next.addResourceBundle !== 'function') {
    return;
  }
  if (!i18next.hasResourceBundle('en', namespace)) {
    i18next.addResourceBundle('en', namespace, resources);
  }
}
