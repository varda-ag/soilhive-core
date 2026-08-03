import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeManagedDependencies, scanUiDependencies } from './packageJson';

describe('scanUiDependencies', () => {
  it('detects the non-relative packages frontend/src/components/UI/ actually imports today', () => {
    expect(scanUiDependencies()).toEqual(['classnames', 'react-router', 'react-tooltip', 'react-use']);
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
    expect(pkg.dependencies.classnames).toBe('2.5.1');
    expect(pkg.dependencies['react-router']).toBe('7.9.4');
    expect(pkg.dependencies['react-tooltip']).toBe('5.30.0');
    expect(pkg.dependencies['react-use']).toBe('17.6.0');
  });

  it('adds a new external package automatically the next time UI/ starts importing it', () => {
    const uiDir = join(tempDir, 'fixture-ui');
    const frontendPackageJsonPath = join(tempDir, 'fixture-frontend-package.json');
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'Widget.tsx'), "import React from 'react';\nexport const Widget = () => null;\n");
    writeFileSync(frontendPackageJsonPath, JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0' } }));
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
      JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0', 'brand-new-package': '^3.1.0' } }),
    );

    mergeManagedDependencies(pluginPath, { uiDir, frontendPackageJsonPath });
    pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['brand-new-package']).toBe('3.1.0');
  });
});
