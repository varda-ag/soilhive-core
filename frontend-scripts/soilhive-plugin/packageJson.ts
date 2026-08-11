import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const UI_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'UI');
const FRONTEND_PACKAGE_JSON = join(REPO_ROOT, 'frontend', 'package.json');

/** Handled separately from the dynamic scan: fixed MF shared singletons plus the synced types package. */
const HANDLED_SEPARATELY = new Set(['react', 'react-dom', 'frontend-plugin-types']);

/**
 * frontend/tsconfig.json's own path aliases (mirrored by jest's moduleNameMapper). UI/ never uses
 * these ("its own icons, its own prop types, relative imports only" — ADR 0024), which is why this
 * distinction never mattered before; Map/ does use several of them (assets/, hooks/), so a bare
 * `hooks/useDevice` must not be mistaken for an npm package named "hooks".
 */
const KNOWN_ALIASES = new Set(['assets', 'components', 'configuration', 'hooks', 'pages', 'types', 'styles', 'adapters', 'utilities']);

const IMPORT_SPECIFIER_PATTERN = /(?:from|require\()\s*['"]([^'"]+)['"]/g;

function packageNameFromSpecifier(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function isLocalSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return true;
  return KNOWN_ALIASES.has(specifier.split('/')[0]);
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

/**
 * Scans the actual imports of the given directories/files rather than using a hardcoded list,
 * since a vendored area's external dependencies can gain new entries over time.
 */
export function scanDependencies(dirsOrFiles: string[]): string[] {
  const packageNames = new Set<string>();
  const files = dirsOrFiles.flatMap(path => (statSync(path).isDirectory() ? listSourceFilesRecursive(path) : [path]));

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const match of content.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const specifier = match[1];
      if (isLocalSpecifier(specifier)) {
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

/** Scans UI/'s actual imports rather than using a hardcoded list, since UI/ gains new external deps over time. */
export function scanUiDependencies(uiDir: string = UI_SRC): string[] {
  return scanDependencies([uiDir]);
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
  /** Additional directories/files to scan for dependencies — e.g. the vendored Map/ folder and
   * its cross-cutting files, when --with-map is set. Omitted entirely for a map-free plugin. */
  extraScanPaths?: string[];
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

  const scanPaths = [uiDir, ...(options.extraScanPaths ?? [])];
  for (const packageName of scanDependencies(scanPaths)) {
    pkg.dependencies[packageName] = pinnedVersion(packageName, frontendPackageJsonPath);
  }

  writeFileSync(pluginPackageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
