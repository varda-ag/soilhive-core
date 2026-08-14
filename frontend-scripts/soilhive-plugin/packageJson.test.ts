import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeManagedDependencies, scanDependencies, scanUiDependencies } from './packageJson';

describe('scanUiDependencies', () => {
  it('detects the non-relative packages frontend/src/components/UI/ actually imports today', () => {
    expect(scanUiDependencies()).toEqual(['classnames', 'react-router', 'react-tooltip', 'react-use']);
  });
});

describe('scanDependencies', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-scan-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not mistake known path aliases (assets/, hooks/, etc.) for npm packages', () => {
    const dir = join(tempDir, 'fixture');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'File.tsx'),
      [
        "import Icon from 'assets/icons/foo.svg?react';",
        "import useDevice from 'hooks/useDevice';",
        "import { MapStyles } from 'types/whatever';",
        "import { geo } from 'utilities/geo';",
        "import { real } from 'a-real-package';",
      ].join('\n'),
    );

    expect(scanDependencies([dir])).toEqual(['a-real-package']);
  });

  it('accepts a mix of directories and individual files', () => {
    const dir = join(tempDir, 'fixture-dir');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'A.tsx'), "import { a } from 'package-a';");
    const singleFile = join(tempDir, 'B.ts');
    writeFileSync(singleFile, "import { b } from 'package-b';");

    expect(scanDependencies([dir, singleFile])).toEqual(['package-a', 'package-b']);
  });
});

describe('mergeManagedDependencies', () => {
  let tempDir: string;
  let pluginPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
    pluginPath = join(tempDir, 'demo-plugin');
    mkdirSync(pluginPath, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('pins react/react-dom/UI-scanned deps while preserving dev-added deps, name, version, and scripts', () => {
    writeFileSync(
      join(pluginPath, 'package.json'),
      JSON.stringify(
        {
          name: 'demo-plugin',
          version: '1.0.0',
          scripts: { dev: 'rsbuild dev' },
          dependencies: { lodash: '^4.17.21' },
        },
        null,
        2,
      ),
    );

    mergeManagedDependencies(pluginPath);

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('demo-plugin');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.scripts).toEqual({ dev: 'rsbuild dev' });
    expect(pkg.dependencies.lodash).toBe('^4.17.21');
    expect(pkg.dependencies.react).toBe('19.2.0');
    expect(pkg.dependencies['react-dom']).toBe('19.2.0');
    expect(pkg.dependencies['frontend-plugin-types']).toBe('link:../frontend-plugin-types');
    expect(pkg.devDependencies.typescript).toBe('5.9.3');
    expect(pkg.dependencies.classnames).toBe('2.5.1');
    expect(pkg.dependencies['react-router']).toBe('7.9.4');
    expect(pkg.dependencies['react-tooltip']).toBe('5.30.0');
    expect(pkg.dependencies['react-use']).toBe('17.6.0');
    // UI/ never imports these — depending on them would be unnecessary for a plugin
    expect(pkg.dependencies.primereact).toBeUndefined();
    expect(pkg.dependencies['react-loading-skeleton']).toBeUndefined();
  });

  it("pins typescript to the host's exact version too, for every plugin — not just --with-map ones, since vendored host code (UI/ or Map/) may need a newer compiler than an old scaffold's pinned version", () => {
    const uiDir = join(tempDir, 'fixture-ui-ts');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package-ts.json');
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0' }, devDependencies: { typescript: '5.9.3' } }),
    );
    writeFileSync(
      join(pluginPath, 'package.json'),
      JSON.stringify({ name: 'demo-plugin', dependencies: {}, devDependencies: { typescript: '5.7.2', '@types/react': '19.2.0' } }),
    );

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath });

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies.typescript).toBe('5.9.3');
    // dev-added/scaffold-owned devDependencies stay untouched
    expect(pkg.devDependencies['@types/react']).toBe('19.2.0');
  });

  it('adds a new external package automatically the next time UI/ starts importing it', () => {
    const uiDir = join(tempDir, 'fixture-ui');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package.json');
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'Widget.tsx'), "import React from 'react';\nexport const Widget = () => null;\n");
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0' }, devDependencies: { typescript: '5.9.3' } }),
    );
    writeFileSync(join(pluginPath, 'package.json'), JSON.stringify({ name: 'demo-plugin', dependencies: {} }));

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath });
    let pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['brand-new-package']).toBeUndefined();

    writeFileSync(
      join(uiDir, 'Widget.tsx'),
      "import React from 'react';\nimport { thing } from 'brand-new-package';\nexport const Widget = () => null;\n",
    );
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({
        dependencies: { react: '19.2.0', 'react-dom': '19.2.0', 'brand-new-package': '^3.1.0' },
        devDependencies: { typescript: '5.9.3' },
      }),
    );

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath });
    pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['brand-new-package']).toBe('3.1.0');
  });

  it('also merges dependencies discovered in extraScanPaths (e.g. the vendored Map/ and its cross-cutting files) when provided', () => {
    const uiDir = join(tempDir, 'fixture-ui-empty');
    const mapDir = join(tempDir, 'fixture-map');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package.json');
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(mapDir, { recursive: true });
    writeFileSync(join(mapDir, 'SoilhiveMap.tsx'), "import { Map } from 'react-map-gl/maplibre';");
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({
        dependencies: { react: '19.2.0', 'react-dom': '19.2.0', 'react-map-gl': '^8.1.0' },
        devDependencies: { typescript: '5.9.3' },
      }),
    );
    writeFileSync(join(pluginPath, 'package.json'), JSON.stringify({ name: 'demo-plugin', dependencies: {} }));

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath, extraScanPaths: [mapDir] });

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['react-map-gl']).toBe('8.1.0');
  });

  it('falls back to the monorepo root package.json for a dependency not listed in frontend/package.json (e.g. @types/geojson, hoisted from the workspace root)', () => {
    const uiDir = join(tempDir, 'fixture-ui-empty-3');
    const mapDir = join(tempDir, 'fixture-map-geojson');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package-3.json');
    const rootPackageJsonPath = join(tempDir, 'fixture-root-package.json');
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(mapDir, { recursive: true });
    writeFileSync(join(mapDir, 'SoilhiveMap.tsx'), "import type { Feature } from 'geojson';");
    // geojson itself is declared in frontend/package.json...
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({
        dependencies: { react: '19.2.0', 'react-dom': '19.2.0', geojson: '^0.5.0' },
        devDependencies: { typescript: '5.9.3' },
      }),
    );
    // ...but its type declarations are a separate package, hoisted from the monorepo root only.
    writeFileSync(rootPackageJsonPath, JSON.stringify({ devDependencies: { '@types/geojson': '^7946.0.16' } }));
    writeFileSync(join(pluginPath, 'package.json'), JSON.stringify({ name: 'demo-plugin', dependencies: {} }));

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath, rootPackageJsonPath, extraScanPaths: [mapDir] });

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.geojson).toBe('0.5.0');
    expect(pkg.devDependencies['@types/geojson']).toBe('7946.0.16');
  });

  it('does not add a devDependencies entry when a scanned package has no matching @types/<name> anywhere', () => {
    const uiDir = join(tempDir, 'fixture-ui-empty-4');
    const mapDir = join(tempDir, 'fixture-map-no-types');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package-4.json');
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(mapDir, { recursive: true });
    writeFileSync(join(mapDir, 'SoilhiveMap.tsx'), "import { thing } from 'classnames';");
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({
        dependencies: { react: '19.2.0', 'react-dom': '19.2.0', classnames: '2.5.1' },
        devDependencies: { typescript: '5.9.3' },
      }),
    );
    writeFileSync(join(pluginPath, 'package.json'), JSON.stringify({ name: 'demo-plugin', dependencies: {} }));

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath, extraScanPaths: [mapDir] });

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.classnames).toBe('2.5.1');
    expect(pkg.devDependencies?.['@types/classnames']).toBeUndefined();
  });

  it("pins i18next alongside react-i18next even though Map/ never imports i18next directly — needed for module federation's shared-singleton version negotiation", () => {
    const uiDir = join(tempDir, 'fixture-ui-empty-5');
    const mapDir = join(tempDir, 'fixture-map-i18next');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package-5.json');
    mkdirSync(uiDir, { recursive: true });
    mkdirSync(mapDir, { recursive: true });
    writeFileSync(join(mapDir, 'SoilhiveMap.tsx'), "import { useTranslation } from 'react-i18next';");
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({
        dependencies: { react: '19.2.0', 'react-dom': '19.2.0', 'react-i18next': '16.5.4', i18next: '25.8.13' },
        devDependencies: { typescript: '5.9.3' },
      }),
    );
    writeFileSync(join(pluginPath, 'package.json'), JSON.stringify({ name: 'demo-plugin', dependencies: {} }));

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath, extraScanPaths: [mapDir] });

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['react-i18next']).toBe('16.5.4');
    expect(pkg.dependencies.i18next).toBe('25.8.13');
  });

  it('does not scan extraScanPaths when omitted (the no-map-plugin default)', () => {
    const uiDir = join(tempDir, 'fixture-ui-empty-2');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package-2.json');
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(
      frontendPackageJsonPath,
      JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0' }, devDependencies: { typescript: '5.9.3' } }),
    );
    writeFileSync(join(pluginPath, 'package.json'), JSON.stringify({ name: 'demo-plugin', dependencies: {} }));

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath });

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['react-map-gl']).toBeUndefined();
  });
});
