import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// Dev-only: `pnpm dev` has no host to call i18next.init(), so the standalone entry (App.tsx)
// does it here so local preview still renders real text. This module must never be imported by
// the federated entry point (ProviderComponent.tsx) — the host owns init() there; see
// docs/adr/0031-plugin-i18n-resource-registration-is-a-reusable-helper-not-a-fixed-file.md.
i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      // Add your own namespace's resources here once you have translation keys, and pass the
      // same namespace/resources to registerResourceBundle(...) in ProviderComponent.tsx, e.g.:
      // 'my-plugin': { greeting: 'Hello' },
    },
  },
  // Cosmetic only: i18next prints an unrelated Locize support notice on the first init() call
  // per instance. Silenced so it doesn't clutter the dev console or test output.
  showSupportNotice: false,
});
