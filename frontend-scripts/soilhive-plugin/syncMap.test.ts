import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncMap, rewriteMapFileImports } from './syncMap';

const REPO_ROOT = join(__dirname, '..', '..');
const MAP_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'Map');

describe('rewriteMapFileImports', () => {
  it('collapses a double-relative import to single-relative', () => {
    expect(rewriteMapFileImports("import { geo } from '../../utilities/geo';")).toBe("import { geo } from '../utilities/geo';");
  });

  it('collapses a double-relative side-effect (CSS) import to single-relative', () => {
    expect(rewriteMapFileImports("import '../../styles/SoilhiveMap.scss';")).toBe("import '../styles/SoilhiveMap.scss';");
  });

  it('rewrites a bare components/UI alias to a flat relative import, for a file directly in Map/', () => {
    expect(rewriteMapFileImports("import { Button } from 'components/UI/Button/Button';", 0)).toBe(
      "import { Button } from '../UI/Button/Button';",
    );
  });

  it('rewrites a bare components/UI alias with one extra ../ per subfolder level, for a file nested inside Map/ (e.g. Map/DaiWidget/DaiWidget.tsx)', () => {
    expect(rewriteMapFileImports("import { ToggleButton } from 'components/UI/ToggleButton/ToggleButton';", 1)).toBe(
      "import { ToggleButton } from '../../UI/ToggleButton/ToggleButton';",
    );
  });

  it('defaults depth to 0 when omitted', () => {
    expect(rewriteMapFileImports("import { Button } from 'components/UI/Button/Button';")).toBe(
      "import { Button } from '../UI/Button/Button';",
    );
  });

  it('leaves single-level relative imports untouched', () => {
    expect(rewriteMapFileImports("import DrawControl from '../DrawControl';")).toBe("import DrawControl from '../DrawControl';");
  });

  it('leaves bare assets/ and hooks/ aliases untouched (resolved via the plugin scaffold aliases instead)', () => {
    const source = "import Icon from 'assets/icons/layers-icon.svg?react';\nimport useDevice from 'hooks/useDevice';";
    expect(rewriteMapFileImports(source)).toBe(source);
  });

  it('leaves npm package imports untouched', () => {
    const source = "import { Map } from 'react-map-gl/maplibre';";
    expect(rewriteMapFileImports(source)).toBe(source);
  });
});

describe('syncMap', () => {
  let tempDir: string;
  let pluginPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-map-'));
    pluginPath = join(tempDir, 'demo-plugin');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('vendors Map/ excluding AreaInfo, UploadPolygonModal, and MapStyleSwitcher', () => {
    syncMap(pluginPath);

    const mapDest = join(pluginPath, 'Map');
    expect(existsSync(join(mapDest, 'AreaInfo'))).toBe(false);
    expect(existsSync(join(mapDest, 'UploadPolygonModal'))).toBe(false);
    expect(existsSync(join(mapDest, 'MapStyleSwitcher'))).toBe(false);
    expect(existsSync(join(mapDest, 'SoilhiveMap.tsx'))).toBe(true);
    expect(existsSync(join(mapDest, 'SoilhiveSimpleMap.tsx'))).toBe(true);
    expect(existsSync(join(mapDest, 'DaiWidget', 'DaiWidget.tsx'))).toBe(true);
  });

  it('vendors the cross-cutting files flat, mirroring how UI/ already sits flat', () => {
    syncMap(pluginPath);

    expect(existsSync(join(pluginPath, 'DrawControl.tsx'))).toBe(true);
    expect(existsSync(join(pluginPath, 'hooks', 'useDevice.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'configuration', 'layout.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'utilities', 'geo.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'utilities', 'geometry.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'utilities', 'map.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'utilities', 'simplifyGeometry.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'utilities', 'environmentVariables.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'types', 'backend.ts'))).toBe(true);
    expect(existsSync(join(pluginPath, 'styles', 'SoilhiveMap.scss'))).toBe(true);
  });

  it('vendors every icon the remaining Map/ files reference', () => {
    syncMap(pluginPath);

    for (const icon of [
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
    ]) {
      expect(existsSync(join(pluginPath, 'assets', 'icons', icon))).toBe(true);
    }
  });

  it('rewrites double-relative imports inside a Map/ file that is not nested in a subfolder', () => {
    syncMap(pluginPath);

    const soilhiveMap = readFileSync(join(pluginPath, 'Map', 'SoilhiveMap.tsx'), 'utf-8');
    expect(soilhiveMap).not.toContain("'../../utilities/geo'");
    expect(soilhiveMap).toContain("'../utilities/geo'");
    expect(soilhiveMap).not.toContain("'../../styles/SoilhiveMap.scss'");
    expect(soilhiveMap).toContain("'../styles/SoilhiveMap.scss'");
  });

  it('rewrites bare components/UI imports with a depth-correct relative path — regression test for Map/DaiWidget/DaiWidget.tsx, which is nested one level deeper than SoilhiveMap.tsx', () => {
    syncMap(pluginPath);

    // syncMap() alone doesn't vendor UI/ (only the full runSoilhivePlugin pipeline does — see
    // run.test.ts for an end-to-end check that this actually resolves to a real file), so this
    // only checks the rewritten specifier's shape.
    const daiWidget = readFileSync(join(pluginPath, 'Map', 'DaiWidget', 'DaiWidget.tsx'), 'utf-8');
    expect(daiWidget).not.toContain("'components/UI/");
    expect(daiWidget).toContain("'../../UI/ToggleButton/ToggleButton'");
    expect(daiWidget).toContain("'../../UI/RangeSlider/RangeSlider'");
  });

  it('leaves bare assets/ and hooks/ imports untouched in the vendored files (resolved via scaffold aliases)', () => {
    syncMap(pluginPath);

    const soilhiveMap = readFileSync(join(pluginPath, 'Map', 'SoilhiveMap.tsx'), 'utf-8');
    expect(soilhiveMap).toContain("'assets/icons/layers-icon.svg?react'");
    expect(soilhiveMap).toContain("'hooks/useDevice'");
  });

  it('is idempotent and host-authoritative — re-running discards a hand-edit', () => {
    syncMap(pluginPath);
    const target = join(pluginPath, 'Map', 'SoilhiveMap.tsx');
    const original = readFileSync(target, 'utf-8');

    syncMap(pluginPath);
    expect(readFileSync(target, 'utf-8')).toBe(original);
  });

  it('never vendors prime.react.override.scss even though SoilhiveMap.scss is now allowed', () => {
    syncMap(pluginPath);
    expect(existsSync(join(pluginPath, 'styles', 'prime.react.override.scss'))).toBe(false);
  });
});

describe("drift detection: Map/'s actual cross-cutting imports match what syncMap vendors", () => {
  const KNOWN_ALIAS_PREFIXES = ['assets/', 'hooks/'];
  const EXCLUDED_SUBFOLDERS = ['AreaInfo', 'UploadPolygonModal', 'MapStyleSwitcher'];
  const VENDORED_ICONS = new Set([
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
  ]);
  const VENDORED_DOUBLE_RELATIVE_TARGETS = new Set([
    'utilities/geo',
    'utilities/map',
    'utilities/simplifyGeometry',
    'utilities/environmentVariables',
    'types/backend',
    'styles/SoilhiveMap.scss',
  ]);
  const VENDORED_COMPONENTS_UI_IMPORTS_ALLOWED = true; // any components/UI/* is fine — UI/ is fully vendored flat

  function listMapFilesExcluding(dir: string, excluded: string[], base = dir): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (excluded.includes(entry)) continue;
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        files.push(...listMapFilesExcluding(fullPath, excluded, base));
      } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it('accounts for every double-relative, components/UI, assets/, and hooks/ import Map/ (minus excluded subfolders) actually has', () => {
    const files = listMapFilesExcluding(MAP_SRC, EXCLUDED_SUBFOLDERS);
    const missing: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const specifierPattern = /(?:from\s+|^import\s+)['"]([^'"]+)['"]/gm;
      for (const match of content.matchAll(specifierPattern)) {
        const specifier = match[1];

        if (specifier.startsWith('../../')) {
          const target = specifier.replace(/^\.\.\/\.\.\//, '').replace(/\?react$/, '');
          if (!VENDORED_DOUBLE_RELATIVE_TARGETS.has(target)) {
            missing.push(`${file}: unaccounted double-relative import '${specifier}'`);
          }
          continue;
        }

        if (specifier.startsWith('components/UI/') || specifier === 'components/UI') {
          if (!VENDORED_COMPONENTS_UI_IMPORTS_ALLOWED) {
            missing.push(`${file}: unaccounted components/UI import '${specifier}'`);
          }
          continue;
        }

        if (specifier.startsWith('assets/icons/')) {
          const iconFile = specifier.replace('assets/icons/', '').replace(/\?react$/, '');
          if (!VENDORED_ICONS.has(iconFile)) {
            missing.push(`${file}: unaccounted icon '${iconFile}' — add it to MAP_ICONS in syncMap.ts`);
          }
          continue;
        }

        if (specifier.startsWith('assets/images/')) {
          missing.push(`${file}: unaccounted image import '${specifier}' — syncMap.ts has no image vendoring`);
          continue;
        }

        if (KNOWN_ALIAS_PREFIXES.some(prefix => specifier.startsWith(prefix))) {
          continue; // resolved via the plugin scaffold's unconditional aliases
        }

        // Everything else is either a same-folder relative import (./x, ../x — single level,
        // resolves fine in the flat plugin layout) or a real npm package — nothing to vendor.
      }
    }

    expect(missing).toEqual([]);
  });

  it('does not vendor components/Dialog (would silently reintroduce primereact)', () => {
    const files = listMapFilesExcluding(MAP_SRC, EXCLUDED_SUBFOLDERS);
    const dialogImporters = files.filter(file => readFileSync(file, 'utf-8').includes('components/Dialog/Dialog'));
    expect(dialogImporters).toEqual([]);
  });
});
