import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const UI_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'UI');
const FRONTEND_PACKAGE_JSON = join(REPO_ROOT, 'frontend', 'package.json');
const ROOT_PACKAGE_JSON = join(REPO_ROOT, 'package.json');

/** Handled separately from the dynamic scan: fixed MF shared singletons plus the synced types package. */
const HANDLED_SEPARATELY = new Set(['react', 'react-dom', 'frontend-plugin-types']);

/**
 * Runtime companions that must be pinned alongside a scanned package even though nothing scanned
 * ever imports them directly — e.g. react-i18next's own required peer, `i18next`, which Map/ only
 * ever reaches indirectly (via `useTranslation`), never with its own `import ... from 'i18next'`.
 * Without this, `i18next` would resolve to whatever version pnpm happens to install transitively,
 * which can drift from the host's exact pinned version — breaking module federation's
 * shared-singleton version negotiation for it (both must agree on a version to actually dedupe;
 * see frontend/src/utilities/moduleFederation.ts and frontend-plugin-example/module-federation.config.ts).
 */
const RUNTIME_COMPANIONS: Record<string, string[]> = {
  'react-i18next': ['i18next'],
};

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

/** Looks a package up in dependencies or devDependencies, across candidate package.json files in order. */
function findVersion(packageName: string, packageJsonPaths: string[]): string | undefined {
  for (const path of packageJsonPaths) {
    const pkg = JSON.parse(readFileSync(path, 'utf-8'));
    const version = pkg.dependencies?.[packageName] ?? pkg.devDependencies?.[packageName];
    if (typeof version === 'string') {
      return stripRange(version);
    }
  }
  return undefined;
}

function pinnedVersion(packageName: string, packageJsonPaths: string[]): string {
  const version = findVersion(packageName, packageJsonPaths);
  if (version === undefined) {
    throw new Error(`"${packageName}" is not declared in ${packageJsonPaths.join(' or ')}`);
  }
  return version;
}

export interface MergeManagedDependenciesOptions {
  uiDir?: string;
  frontendPackageJsonPath?: string;
  /** Fallback lookup source for a dependency not declared in frontend/package.json itself — e.g.
   * `@types/geojson`, a monorepo-root devDependency hoisted to frontend/ by pnpm's workspace
   * resolution. A standalone plugin repo needs it declared explicitly, since it isn't part of
   * that workspace. */
  rootPackageJsonPath?: string;
  /** Additional directories/files to scan for dependencies — e.g. the vendored Map/ folder and
   * its cross-cutting files, when --with-map is set. Omitted entirely for a map-free plugin. */
  extraScanPaths?: string[];
}

export function mergeManagedDependencies(pluginPath: string, options: MergeManagedDependenciesOptions = {}): void {
  const uiDir = options.uiDir ?? UI_SRC;
  const frontendPackageJsonPath = options.frontendPackageJsonPath ?? FRONTEND_PACKAGE_JSON;
  const rootPackageJsonPath = options.rootPackageJsonPath ?? ROOT_PACKAGE_JSON;
  const packageJsonPaths = [frontendPackageJsonPath, rootPackageJsonPath];

  const pluginPackageJsonPath = join(pluginPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pluginPackageJsonPath, 'utf-8'));
  pkg.dependencies = pkg.dependencies ?? {};

  pkg.dependencies.react = pinnedVersion('react', packageJsonPaths);
  pkg.dependencies['react-dom'] = pinnedVersion('react-dom', packageJsonPaths);
  pkg.dependencies['frontend-plugin-types'] = 'link:../frontend-plugin-types';

  const scanPaths = [uiDir, ...(options.extraScanPaths ?? [])];
  for (const packageName of scanDependencies(scanPaths)) {
    pkg.dependencies[packageName] = pinnedVersion(packageName, packageJsonPaths);

    for (const companionName of RUNTIME_COMPANIONS[packageName] ?? []) {
      pkg.dependencies[companionName] = pinnedVersion(companionName, packageJsonPaths);
    }

    // A runtime package without its own bundled type declarations needs a matching @types/<name>
    // companion (e.g. geojson -> @types/geojson) — merge it in as a devDependency if one exists.
    const typesPackageName = `@types/${packageName}`;
    const typesVersion = findVersion(typesPackageName, packageJsonPaths);
    if (typesVersion !== undefined) {
      pkg.devDependencies = pkg.devDependencies ?? {};
      pkg.devDependencies[typesPackageName] = typesVersion;
    }
  }

  writeFileSync(pluginPackageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
