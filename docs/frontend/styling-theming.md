# Styling and Theming

## CSS architecture

Styles are written in SCSS and organized into two layers:

1. **Global styles** in `src/styles/` — variables, typography, reset, PrimeReact overrides.
2. **Component styles** as co-located `.module.scss` files — scoped to the component via CSS Modules.

### Global styles entry point

`src/styles/index.scss` imports in this order:

```scss
@use 'variables/colors';      // SCSS color variables
@use 'variables/typography';  // Font sizes, weights, line heights
@use 'fonts';                 // @font-face declarations
@use 'base';                  // CSS reset and body defaults
@use 'prime.react.override';  // PrimeReact component overrides
```

This file is imported once in `src/index.tsx`.

### CSS Modules

Component-level styles use CSS Modules (`.module.scss`). Rsbuild processes them automatically.

```tsx
import styles from './MyComponent.module.scss';

function MyComponent() {
  return <div className={styles.container}>...</div>;
}
```

Class names are locally scoped — `.container` in one module never collides with `.container` in another.

---

## Dynamic theming

### Admin-controlled colors

The admin portal allows operators to customize brand colors. These are stored in the backend and fetched by `ThemeContext` at startup.

The `LookAndFeelContext` manages the editing flow and applies changes via CSS custom properties on the `:root` element. Components reference these properties in their SCSS:

```scss
.primaryButton {
  background-color: var(--color-primary);
  color: var(--color-on-primary);
}
```

When an admin saves new colors, `LookAndFeelContext` updates the CSS variables immediately — no page reload is needed.

### Default colors

Default color values are defined in `src/configuration/colors.ts`. These are used when the backend has no custom theme configured and as the reset target when the admin clicks "Reset to defaults".

### ThemeContext values

`useTheme()` returns:

| Value | Description |
|---|---|
| `colors` | Brand colors object (primary, secondary, accent, etc.) |
| `initialBbox` | Default map bounding box `[west, south, east, north]` |
| `termsAndConditionsHtml` | Rich-text HTML for the Terms of Use page |
| `privacyPolicyHtml` | Rich-text HTML for the Privacy Policy page |
| `notificationBanner` | Config for the persistent banner (text, type, enabled) |

---

## PrimeReact

PrimeReact is the component library used for complex UI primitives (data tables, dialogs, dropdowns, date pickers, etc.).

The active theme is **Mira**. The file `src/styles/prime.react.override.scss` overrides PrimeReact's default CSS variables to match the SoilHive design.

When adding new PrimeReact components, check whether the component needs a theme override. Add overrides to `prime.react.override.scss` rather than inline styles or component-level SCSS, so they apply consistently everywhere the component is used.

---

## UI component library

`src/components/UI/` contains the project's own design system components built on top of HTML and PrimeReact. Use these instead of raw HTML elements or PrimeReact primitives in feature code.

Key categories:

| Category | Components |
|---|---|
| Form inputs | `TextInput`, `TextArea`, `Checkbox`, `Toggle`, `Dropdown`, `AutocompleteDropdown` |
| Buttons | `Button`, `SplitButton` |
| Layout | `Accordion`, `Tabs`, `Steps`, `PageSidebar`, `MobileTabNavigation` |
| Feedback | `Notification`, `ProgressBar`, `Loader`, `InfoDialog` |
| Selectors | `MultirangeSlider`, `RangeSlider`, `NestedCheckbox`, `SelectionPills`, `MultiselectButtons` |
| Misc | `Table`, `Tag`, `Menu`, `Dialog`, `FileUploadBox`, `ColorPicker`, `Cropper` |

---

## Internationalization (i18n)

The app uses **i18next** with **react-i18next** for translations.

### Configuration

`src/utilities/i18n.ts` initialises i18next in browser mode:
- Language is auto-detected from the browser (`i18next-browser-languagedetector`).
- Translation files are loaded over HTTP from `/locales/<lang>/<namespace>.json` (`i18next-http-backend`).
- Falls back to English if the detected language has no translations.

### Translation files

Located in `frontend/public/locales/<lang>/`. Currently supported languages: `en`, `de`, `es`, `it`.

Each language has these namespaces:

| File | Contents |
|---|---|
| `common.json` | Shared labels, error messages, navigation |
| `admin.json` | Admin portal strings |
| `availability.json` | Data explorer strings |
| `download.json` | Download flow strings |
| `metadata.json` | Dataset metadata page strings |
| `consent.json` | Cookie consent banner strings |

### Using translations in components

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  return <p>{t('save_button_label')}</p>;
}
```

For the admin namespace:

```tsx
const { t } = useTranslation('admin');
```

### Adding a new string

1. Add the key and English value to `public/locales/en/<namespace>.json`.
2. Add translations to the other locale files (`de`, `es`, `it`).
3. Reference it with `t('your_key')` in the component.

### SSR translations

In SSR mode, translation files are imported statically (not via HTTP). Only English is available server-side. See [ssr.md](ssr.md#i18n-in-ssr) for details.

---

## Map styling

The map uses **MapLibre GL**. Custom layer styles (colors, line widths, fill opacity) for the coverage and geometry layers are defined in the map utility files:

- `src/utilities/mapbox.ts` — style helper functions
- `src/utilities/map.ts` — layer configuration
- `src/styles/SoilhiveMap.scss` — map container and control CSS

The basemap tile style URL is configurable and can reference admin-configured colors to match the brand palette.
