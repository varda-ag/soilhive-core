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
 *   - UploadPolygonModal/ -> superseded by SoilhiveMapRef.onUpload (drag-and-drop already covers
 *                        this; SoilhiveMapToolbar exposes onUploadClick for a host/plugin to
 *                        supply its own upload UI instead).
 *   - MapStyleSwitcher/  -> style-switching UI moved to the host (see Availability.tsx); a plugin
 *                        can build its own using SoilhiveMap's currentMapStyleIndex prop.
 */
const EXCLUDED_MAP_SUBFOLDERS = ['AreaInfo', 'UploadPolygonModal', 'MapStyleSwitcher'];

/**
 * Files Map/ reaches outside its own folder for. Unlike UI/ ("its own icons, its own prop types,
 * relative imports only"), Map/ is not self-contained, so these have to be vendored
 * alongside it. Each is copied flat, mirroring how UI/ already sits flat at <plugin>/UI/ rather
 * than nested under <plugin>/components/UI/ — so relative imports between Map/ and these stay the
 * same distance apart as they are in the host.
 *
 * Kept as an explicit, reviewed list rather than dynamically scanned (contrast with
 * scanUiDependencies in packageJson.ts) because unlike UI/'s *npm* dependencies — which
 * legitimately grow over time — this is a fixed, small set of specific in-repo files; a dynamic
 * resolver here would be solving a problem this codebase doesn't have yet. syncMap.test.ts
 * guards against silent drift by re-scanning Map/'s actual imports and failing if a new
 * cross-cutting reference shows up that isn't accounted for here.
 */
const CROSS_CUTTING_FILES: Array<{ src: string; dest: string }> = [
  { src: join(FRONTEND_SRC, 'components', 'DrawControl.tsx'), dest: 'DrawControl.tsx' },
  { src: join(FRONTEND_SRC, 'hooks', 'useDevice.ts'), dest: join('hooks', 'useDevice.ts') },
  { src: join(FRONTEND_SRC, 'configuration', 'layout.ts'), dest: join('configuration', 'layout.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'geo.ts'), dest: join('utilities', 'geo.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'geometry.ts'), dest: join('utilities', 'geometry.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'map.ts'), dest: join('utilities', 'map.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'simplifyGeometry.ts'), dest: join('utilities', 'simplifyGeometry.ts') },
  { src: join(FRONTEND_SRC, 'utilities', 'environmentVariables.ts'), dest: join('utilities', 'environmentVariables.ts') },
  { src: join(FRONTEND_SRC, 'types', 'backend.ts'), dest: join('types', 'backend.ts') },
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
 * Vendored Map/ files use two import shapes that don't resolve as-is once flattened into a
 * plugin: a double-relative `../../x` (host: components/Map/ is 2 levels below src/; plugin:
 * <plugin>/Map/ is only 1 level below plugin root, so it collapses to `../x` — this offset is a
 * constant -1 regardless of how deep the importing file sits within Map/, since both the host and
 * plugin nesting grow by the same amount per subfolder level), and a bare `components/UI/x` alias.
 *
 * The `components/UI/x` case is depth-*dependent*, unlike the double-relative case: a bare alias
 * carries no positional information, so the correct number of `../` to reach the plugin's flat
 * `UI/` depends on how many subfolders deep the importing file is within Map/ (`depthWithinMap`,
 * 0 for a file directly in Map/ like SoilhiveMap.tsx, 1 for e.g. Map/DaiWidget/DaiWidget.tsx, which
 * needs `../../UI/x` rather than `../UI/x`). Getting this wrong compiles fine (no bad path is
 * unambiguously invalid syntax) but silently produces an unresolvable import — this was caught by
 * an end-to-end test against a real plugin, not by unit-testing the string transform in isolation.
 *
 * `assets/x` and `hooks/x` bare aliases are left untouched regardless of depth — the plugin
 * scaffold carries matching aliases unconditionally (see frontend-plugin-example/rsbuild.config.ts)
 * specifically so retrofitting --with-map onto an existing plugin never needs to touch its
 * (dev-owned-after-creation) build config.
 */
export function rewriteMapFileImports(content: string, depthWithinMap = 0): string {
  const uiPrefix = '../'.repeat(depthWithinMap + 1);
  return content.replace(/(['"])\.\.\/\.\.\//g, '$1../').replace(/(['"])components\/UI\//g, `$1${uiPrefix}UI/`);
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
    alwaysOverwrite(src, join(pluginPath, dest));
  }

  for (const icon of icons) {
    alwaysOverwrite(join(iconsSrc, icon), join(pluginPath, 'assets', 'icons', icon));
  }

  alwaysOverwrite(join(stylesSrc, 'SoilhiveMap.scss'), join(pluginPath, 'styles', 'SoilhiveMap.scss'), { allowMapAssets: true });
}
