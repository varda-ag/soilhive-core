import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { copyOnceIfMissing } from './copyEngine';

const REPO_ROOT = join(__dirname, '..', '..');
const EXAMPLE_DIR = join(REPO_ROOT, 'frontend-plugin-example');

/**
 * Explicit file list read from frontend-plugin-example/ at run time. Includes
 * src/mockContext.ts so a freshly scaffolded plugin has a working local preview out of the
 * box — App.tsx already imports it — rather than a dangling import.
 */
const SCAFFOLD_FILES = [
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
];

export function scaffoldPlugin(pluginPath: string, pluginName: string): void {
  for (const relativeFile of SCAFFOLD_FILES) {
    copyOnceIfMissing(join(EXAMPLE_DIR, relativeFile), join(pluginPath, relativeFile));
  }
  scaffoldPackageJson(pluginPath, pluginName);
}

function scaffoldPackageJson(pluginPath: string, pluginName: string): void {
  const destPath = join(pluginPath, 'package.json');
  if (existsSync(destPath)) {
    return;
  }

  const pkg = JSON.parse(readFileSync(join(EXAMPLE_DIR, 'package.json'), 'utf-8'));
  pkg.name = pluginName;
  writeFileSync(destPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
