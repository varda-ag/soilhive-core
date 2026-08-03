import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('hints that pnpm (not npm) must be used to install, since link: is not npm-supported', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    runSoilhivePlugin(pluginPath);

    const loggedLines = logSpy.mock.calls.map(call => call[0]);
    expect(loggedLines.some(line => typeof line === 'string' && line.includes('pnpm install') && line.includes(pluginPath))).toBe(true);

    logSpy.mockRestore();
  });

  it('hints how to run the plugin locally after install', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    runSoilhivePlugin(pluginPath);

    const loggedLines = logSpy.mock.calls.map(call => call[0]);
    expect(loggedLines.some(line => typeof line === 'string' && line.includes('pnpm dev') && line.includes(pluginPath))).toBe(true);

    logSpy.mockRestore();
  });
});
