import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const UI_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'UI');
const FRONTEND_PACKAGE_JSON = join(REPO_ROOT, 'frontend', 'package.json');

/** Handled separately from the dynamic scan: fixed MF shared singletons plus the synced types package. */
const HANDLED_SEPARATELY = new Set(['react', 'react-dom', 'frontend-plugin-types']);

const IMPORT_SPECIFIER_PATTERN = /(?:from|require\()\s*['"]([^'"]+)['"]/g;

function packageNameFromSpecifier(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function listSourceFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFilesRecursive(fullPath));
    } else if (extname(fullPath) === '.ts' || extname(fullPath) === '.tsx') {
      files.push(fullPath);
    }
  }
  return files;
}

/** Scans UI/'s actual imports rather than using a hardcoded list, since UI/ gains new external deps over time. */
export function scanUiDependencies(uiDir: string = UI_SRC): string[] {
  const packageNames = new Set<string>();

  for (const file of listSourceFilesRecursive(uiDir)) {
    const content = readFileSync(file, 'utf-8');
    for (const match of content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        continue;
      }

      const packageName = packageNameFromSpecifier(specifier);
      if (!HANDLED_SEPARATELY.has(packageName)) {
        packageNames.add(packageName);
      }
    }
  }

  return [...packageNames].sort();
}

function stripRange(version: string): string {
  return version.replace(/^[\^~]/, '');
}

function pinnedVersion(packageName: string, frontendPackageJsonPath: string): string {
  const frontendPkg = JSON.parse(readFileSync(frontendPackageJsonPath, 'utf-8'));
  const version = frontendPkg.dependencies?.[packageName];
  if (typeof version !== 'string') {
    throw new Error(`"${packageName}" is not declared in frontend/package.json`);
  }
  return stripRange(version);
}

export interface MergeManagedDependenciesOptions {
  uiDir?: string;
  frontendPackageJsonPath?: string;
}

export function mergeManagedDependencies(pluginPath: string, options: MergeManagedDependenciesOptions = {}): void {
  const uiDir = options.uiDir ?? UI_SRC;
  const frontendPackageJsonPath = options.frontendPackageJsonPath ?? FRONTEND_PACKAGE_JSON;

  const pluginPackageJsonPath = join(pluginPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pluginPackageJsonPath, 'utf-8'));
  pkg.dependencies = pkg.dependencies ?? {};

  pkg.dependencies.react = pinnedVersion('react', frontendPackageJsonPath);
  pkg.dependencies['react-dom'] = pinnedVersion('react-dom', frontendPackageJsonPath);
  pkg.dependencies['frontend-plugin-types'] = 'link:../frontend-plugin-types';

  for (const packageName of scanUiDependencies(uiDir)) {
    pkg.dependencies[packageName] = pinnedVersion(packageName, frontendPackageJsonPath);
  }

  writeFileSync(pluginPackageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
