import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { alwaysOverwrite } from './copyEngine';

const REPO_ROOT = join(__dirname, '..', '..');
const FRONTEND_SRC = join(REPO_ROOT, 'frontend', 'src');
const MAP_SRC = join(FRONTEND_SRC, 'components', 'Map');
const STYLES_SRC = join(FRONTEND_SRC, 'styles');
const ICONS_SRC = join(FRONTEND_SRC, 'assets', 'icons');

/**
 * Subfolders of Map/ that are never vendored, because each transitively needs `primereact`
 * (via components/Dialog/Dialog), which plugins deliberately don't depend on:
 *   - AreaInfo/       -> also excluded because it's the planned home of ADR 0025's map-info-card
 *                        capability; a plugin must never ship remote-loading logic of its own.
 *   - UploadPolygonModal/ -> superseded by SoilhiveMapRef.onUpload as the *destination* for an
 *                        upload — but onUpload only ever accepts an already-parsed geometry, not
 *                        a File. The drop-zone wiring and File->geometry parsing themselves are
 *                        page-level code (see Availability.tsx's onDrop), not something Map/
 *                        provides automatically; parseGeoJSONFile below is vendored specifically
 *                        so a plugin's own page can reproduce that pattern, the same as the host's
 *                        does. SoilhiveMapToolbar's onUploadClick prop covers the "upload via a
 *                        button, not drag-and-drop" case instead.
 *   - MapStyleSwitcher/  -> style-switching UI moved to the host (see Availability.tsx); a plugin
 *                        can build its own using SoilhiveMap's currentMapStyleIndex prop.
 */
const EXCLUDED_MAP_SUBFOLDERS = ['AreaInfo', 'UploadPolygonModal', 'MapStyleSwitcher'];

/**
 * Files Map/ reaches outside its own folder for. Unlike UI/ ("its own icons, its own prop types,
 * relative imports only"), Map/ is not self-contained, so these have to be vendored alongside it.
 *
 * Nested under Map/_shared/ (not flat at the plugin root, unlike UI/) so a plugin author scanning
 * the tree can tell at a glance "this is part of the map system" rather than finding map internals
 * scattered across five unrelated-looking top-level folders (hooks/, utilities/, types/, ...).
 * The plugin scaffold's assets/hooks/types/utilities/configuration aliases (still added
 * unconditionally, see ADR 0025) stay pointed at the plugin root regardless — they remain
 * available for a plugin author's own code; Map/'s own references to them are rewritten to
 * relative Map/_shared/ paths at sync time instead (see rewriteMapFileImports) specifically so
 * retrofitting --with-map never needs those aliases to point anywhere new.
 *
 * Kept as an explicit, reviewed list rather than dynamically scanned (contrast with
 * scanUiDependencies in packageJson.ts) because unlike UI/'s *npm* dependencies — which
 * legitimately grow over time — this is a fixed, small set of specific in-repo files; a dynamic
 * resolver here would be solving a problem this codebase doesn't have yet. syncMap.test.ts
 * guards against silent drift by re-scanning Map/'s actual imports and failing if a new
 * cross-cutting reference shows up that isn't accounted for here — though note that scan only
 * covers Map/'s own direct imports, not this list's *own* transitive ones (e.g. useDevice.ts
 * importing configuration/layout.ts below); a second-order dependency here has to be caught by
 * eye, the same way this list itself does.
 *
 * `parseGeoJSONFile.ts` is the one entry here Map/'s own files never actually import — it's
 * vendored anyway because a plugin author's own page needs it to reproduce the host's
 * drag-and-drop-upload pattern (parse the dropped File, then call SoilhiveMapRef.onUpload with
 * the result — see Availability.tsx's onDrop for the pattern this mirrors). Its own dependency,
 * `@placemarkio/check-geojson`, is picked up automatically by the existing dynamic npm-dependency
 * scan, same as everything else here.
 */
const MAP_SHARED_DIRNAME = '_shared';

export const CROSS_CUTTING_FILES: Array<{ src: string; dest: string }> = [
  { src: join(FRONTEND_SRC, 'components', 'DrawControl.tsx'), dest: join(MAP_SHARED_DIRNAME, 'DrawControl.tsx') },
  { src: join(FRONTEND_SRC, 'hooks', 'useDevice.ts'), dest: join(MAP_SHARED_DIRNAME, 'hooks', 'useDevice.ts') },
  { src: join(FRONTEND_SRC, 'configuration', 'layout.ts'), dest: join(MAP_SHARED_DIRNAME, 'configuration', 'layout.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'geo.ts'), dest: join(MAP_SHARED_DIRNAME, 'utilities', 'geo.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'geometry.ts'), dest: join(MAP_SHARED_DIRNAME, 'utilities', 'geometry.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'map.ts'), dest: join(MAP_SHARED_DIRNAME, 'utilities', 'map.ts') },
  {
    src: join(FRONTEND_SRC, 'utilities', 'simplifyGeometry.ts'),
    dest: join(MAP_SHARED_DIRNAME, 'utilities', 'simplifyGeometry.ts'),
  },
  {
    src: join(FRONTEND_SRC, 'utilities', 'environmentVariables.ts'),
    dest: join(MAP_SHARED_DIRNAME, 'utilities', 'environmentVariables.ts'),
  },
  {
    src: join(FRONTEND_SRC, 'utilities', 'parseGeoJSONFile.ts'),
    dest: join(MAP_SHARED_DIRNAME, 'utilities', 'parseGeoJSONFile.ts'),
  },
  { src: join(FRONTEND_SRC, 'types', 'backend.ts'), dest: join(MAP_SHARED_DIRNAME, 'types', 'backend.ts') },
];

/** Icons the vendored Map/ files reference via the `assets/icons/*.svg?react` alias. */
const MAP_ICONS = [
  'arrow-down-icon.svg',
  'dropdown-arrow-down-icon.svg',
  'layers-icon.svg',
  'marker-pin-icon.svg',
  'pencil-icon.svg',
  'small-cross-icon.svg',
  'small-layers-icon.svg',
  'small-line-icon.svg',
  'small-map-pin-icon.svg',
  'small-polygon-icon.svg',
  'small-reload-icon.svg',
  'small-reset-icon.svg',
  'small-search-icon.svg',
  'small-upload-icon.svg',
];

/**
 * Vendored Map/ files reach cross-cutting dependencies two ways, neither of which resolves as-is
 * once Map/'s siblings move from the plugin root into Map/_shared/:
 *
 * - A bare alias (`hooks/useDevice`, `assets/icons/x.svg?react`) or a double-relative path
 *   (`../../utilities/geo`, `../../types/backend`) — both carry no information about where
 *   Map/_shared/ actually is, so both are rewritten the same way: as a relative path from the
 *   importing file back up to Map/ (`depthWithinMap` levels — 0 for a file directly in Map/ like
 *   SoilhiveMap.tsx, 1 for e.g. Map/DaiWidget/DaiWidget.tsx) and then down into `_shared/`.
 * - A single-relative sibling import (`../DrawControl`) — DrawControl.tsx used to sit flat at the
 *   plugin root, one level up from Map/, which this import already reached correctly by
 *   coincidence. Now that it's moved into Map/_shared/, that coincidence is gone, so this needs
 *   the same depth-aware `_shared/` rewrite as everything else.
 *
 * `components/UI/x` is the only shape that's genuinely different: UI/ stays flat at the plugin
 * root (unlike Map/'s own cross-cutting files), so it needs one *extra* `../` to escape Map/
 * entirely, on top of `depthWithinMap`.
 *
 * `../../styles/SoilhiveMap.scss` is also different again: styles/ is *not* one of the files
 * moved into Map/_shared/ (only DrawControl/hooks/utilities/types/configuration/assets-icons
 * are), so it keeps the old flat-plugin-root behavior — a double-relative `../../` simply
 * collapses to `../`, a constant -1 regardless of depth, since both host and plugin nesting grow
 * by the same amount per subfolder level.
 *
 * Getting the `../` count wrong compiles fine (no bad path is unambiguously invalid syntax) but
 * silently produces an unresolvable import — this was caught by an end-to-end test against a real
 * plugin, not by unit-testing the string transform in isolation.
 */
export function rewriteMapFileImports(content: string, depthWithinMap = 0): string {
  const sharedPrefix = depthWithinMap === 0 ? `./${MAP_SHARED_DIRNAME}/` : `${'../'.repeat(depthWithinMap)}${MAP_SHARED_DIRNAME}/`;
  const uiPrefix = '../'.repeat(depthWithinMap + 1);

  return content
    .replace(/(['"])\.\.\/DrawControl(['"])/g, `$1${sharedPrefix}DrawControl$2`)
    .replace(/(['"])\.\.\/\.\.\/utilities\//g, `$1${sharedPrefix}utilities/`)
    .replace(/(['"])\.\.\/\.\.\/types\//g, `$1${sharedPrefix}types/`)
    .replace(/(['"])\.\.\/\.\.\/styles\//g, '$1../styles/')
    .replace(/(['"])hooks\//g, `$1${sharedPrefix}hooks/`)
    .replace(/(['"])assets\/icons\//g, `$1${sharedPrefix}assets/icons/`)
    .replace(/(['"])components\/UI\//g, `$1${uiPrefix}UI/`);
}

function listSourceFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function rewriteMapFilesInPlace(mapDest: string): void {
  for (const file of listSourceFilesRecursive(mapDest)) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
    const depthWithinMap = relative(mapDest, file).split(sep).length - 1;
    const original = readFileSync(file, 'utf-8');
    const rewritten = rewriteMapFileImports(original, depthWithinMap);
    if (rewritten !== original) {
      writeFileSync(file, rewritten);
    }
  }
}

export interface SyncMapOptions {
  mapSrc?: string;
  stylesSrc?: string;
  iconsSrc?: string;
  /** `dest` is relative to the plugin's Map/ folder (e.g. `_shared/hooks/useDevice.ts`), not the plugin root. */
  crossCuttingFiles?: Array<{ src: string; dest: string }>;
  icons?: string[];
}

export function syncMap(pluginPath: string, options: SyncMapOptions = {}): void {
  const mapSrc = options.mapSrc ?? MAP_SRC;
  const stylesSrc = options.stylesSrc ?? STYLES_SRC;
  const iconsSrc = options.iconsSrc ?? ICONS_SRC;
  const crossCuttingFiles = options.crossCuttingFiles ?? CROSS_CUTTING_FILES;
  const icons = options.icons ?? MAP_ICONS;

  const mapDest = join(pluginPath, 'Map');
  alwaysOverwrite(mapSrc, mapDest, { excludeBasenames: EXCLUDED_MAP_SUBFOLDERS });
  rewriteMapFilesInPlace(mapDest);

  for (const { src, dest } of crossCuttingFiles) {
    alwaysOverwrite(src, join(mapDest, dest));
  }

  for (const icon of icons) {
    alwaysOverwrite(join(iconsSrc, icon), join(mapDest, MAP_SHARED_DIRNAME, 'assets', 'icons', icon));
  }

  alwaysOverwrite(join(stylesSrc, 'SoilhiveMap.scss'), join(pluginPath, 'styles', 'SoilhiveMap.scss'), { allowMapAssets: true });
}
