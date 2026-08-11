import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { runSoilhivePlugin } from './run';

const REPO_ROOT = join(__dirname, '..', '..');
const UI_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'UI');
const PLUGIN_TYPES_SRC = join(REPO_ROOT, 'frontend-plugin-types');

function listFilesRecursive(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listFilesRecursive(fullPath, base));
    } else {
      files.push(fullPath.slice(base.length + 1));
    }
  }
  return files;
}

describe('runSoilhivePlugin end-to-end', () => {
  let root: string;
  let pluginPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sh-plugin-root-'));
    pluginPath = join(root, 'demo-plugin');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('produces the exact expected file tree with no missing or extra files across create then sync', () => {
    runSoilhivePlugin(pluginPath); // create
    runSoilhivePlugin(pluginPath); // sync (idempotent re-run)

    const scaffoldFiles = [
      'rsbuild.config.ts',
      'module-federation.config.ts',
      'tsconfig.json',
      'pnpm-workspace.yaml',
      'src/App.tsx',
      'src/App.css',
      'src/bootstrap.tsx',
      'src/index.tsx',
      'src/env.d.ts',
      'src/components/ProviderComponent.tsx',
      'src/components/ProviderComponent.css',
      'src/mockContext.ts',
      'package.json',
    ];
    const uiFiles = listFilesRecursive(UI_SRC).map(relativeFile => join('UI', relativeFile));
    const stylesFiles = [
      'base.scss',
      'fonts.scss',
      'index.scss',
      'variables/_breakpoints.scss',
      'variables/_colors.scss',
      'variables/_typography.scss',
    ].map(relativeFile => join('styles', relativeFile));
    const expectedFiles = [...scaffoldFiles, ...uiFiles, ...stylesFiles].sort();

    expect(listFilesRecursive(pluginPath).sort()).toEqual(expectedFiles);
    expect(readdirSync(root).sort()).toEqual(['demo-plugin', 'frontend-plugin-types']);
    expect(readdirSync(join(root, 'frontend-plugin-types')).sort()).toEqual(readdirSync(PLUGIN_TYPES_SRC).sort());

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('demo-plugin');
    expect(pkg.dependencies['frontend-plugin-types']).toBe('link:../frontend-plugin-types');
    expect(pkg.dependencies.react).not.toMatch(/^[\^~]/);
    expect(pkg.dependencies['react-dom']).not.toMatch(/^[\^~]/);
  });

  it('never syncs SoilhiveMap.scss or prime.react.override.scss, even after multiple syncs', () => {
    runSoilhivePlugin(pluginPath);
    runSoilhivePlugin(pluginPath);
    runSoilhivePlugin(pluginPath);

    const allFiles = listFilesRecursive(root);
    const forbidden = allFiles.filter(file => file.endsWith('SoilhiveMap.scss') || file.endsWith('prime.react.override.scss'));

    expect(forbidden).toEqual([]);
  });

  it('does not vendor the map at all without --with-map', () => {
    runSoilhivePlugin(pluginPath);

    expect(listFilesRecursive(pluginPath)).not.toContain('Map/SoilhiveMap.tsx');
    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['react-map-gl']).toBeUndefined();
  });

  it('vendors the map and merges its dependencies when --with-map is passed', () => {
    runSoilhivePlugin(pluginPath, { withMap: true });

    const files = listFilesRecursive(pluginPath);
    expect(files).toContain(join('Map', 'SoilhiveMap.tsx'));
    expect(files).not.toContain(join('Map', 'AreaInfo', 'index.ts'));
    expect(files).toContain(join('Map', '_shared', 'DrawControl.tsx'));
    expect(files).toContain(join('Map', '_shared', 'hooks', 'useDevice.ts'));
    expect(files).toContain(join('styles', 'SoilhiveMap.scss'));

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['react-map-gl']).not.toMatch(/^[\^~]/);
    expect(pkg.dependencies['maplibre-gl']).not.toMatch(/^[\^~]/);
  });

  it('rewrites every relative import inside the vendored Map/ tree to a path that actually resolves — catches depth-dependent rewrite bugs unit tests on the string transform alone would miss', () => {
    runSoilhivePlugin(pluginPath, { withMap: true });

    const mapFiles = listFilesRecursive(pluginPath).filter(file => file.startsWith(`Map${sep}`) && file.endsWith('.tsx'));
    expect(mapFiles.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const relativeFile of mapFiles) {
      const absoluteFile = join(pluginPath, relativeFile);
      const content = readFileSync(absoluteFile, 'utf-8');
      for (const match of content.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g)) {
        const specifier = match[1].replace(/\?react$/, '');
        const resolved = join(absoluteFile, '..', specifier);
        const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.svg`, `${resolved}.scss`, `${resolved}.css`];
        if (!candidates.some(candidate => existsSync(candidate))) {
          missing.push(`${relativeFile}: '${specifier}' does not resolve to any of ${JSON.stringify(candidates)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the map in sync on a later run that omits --with-map, once a plugin has opted in', () => {
    runSoilhivePlugin(pluginPath, { withMap: true });
    runSoilhivePlugin(pluginPath); // no flag this time — opt-in should persist

    expect(listFilesRecursive(pluginPath)).toContain(join('Map', 'SoilhiveMap.tsx'));
  });

  it('ends with a copy-pasteable next-steps block (cd, install, dev)', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    runSoilhivePlugin(pluginPath);

    const output = logSpy.mock.calls
      .map(call => String(call[0] ?? ''))
      .join('\n')
      // eslint-disable-next-line no-control-regex -- strips ANSI color codes so assertions are color-agnostic
      .replace(/\x1b\[[0-9;]*m/g, '');
    expect(output).toContain(`cd ${pluginPath}`);
    expect(output).toContain('pnpm install');
    expect(output).toContain('pnpm dev');
    expect(output).toContain('npm does not support the "link:" protocol');

    logSpy.mockRestore();
  });
});
