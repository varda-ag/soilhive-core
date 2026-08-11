import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export type PluginMode = 'create' | 'sync';

export interface PluginPaths {
  fullPath: string;
  root: string;
  pluginName: string;
}

export function resolvePluginPaths(fullPath: string): PluginPaths {
  return {
    fullPath,
    root: dirname(fullPath),
    pluginName: basename(fullPath),
  };
}

function isPluginShaped(packageJsonPath: string): boolean {
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  } catch {
    return false;
  }

  if (typeof pkg !== 'object' || pkg === null) {
    return false;
  }

  const { dependencies } = pkg as { dependencies?: unknown };
  if (typeof dependencies !== 'object' || dependencies === null) {
    return false;
  }

  const deps = dependencies as Record<string, unknown>;
  return typeof deps.react === 'string' && typeof deps['react-dom'] === 'string' && typeof deps['frontend-plugin-types'] === 'string';
}

export function resolveMode(fullPath: string): PluginMode {
  if (!existsSync(fullPath)) {
    return 'create';
  }

  const packageJsonPath = join(fullPath, 'package.json');
  if (!isPluginShaped(packageJsonPath)) {
    throw new Error(
      `"${fullPath}" already exists but does not look like a soilhive plugin (expected a package.json with "react", "react-dom", and "frontend-plugin-types" dependencies)`,
    );
  }

  return 'sync';
}

function hasMapDependency(packageJsonPath: string): boolean {
  if (!existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return typeof pkg?.dependencies?.['react-map-gl'] === 'string';
  } catch {
    return false;
  }
}

/**
 * Whether the map should be synced this run — either the flag was passed explicitly, or the
 * plugin already opted in on a previous run (detected via `react-map-gl` already present in its
 * package.json, the same way `resolveMode` detects an existing plugin). This means `--with-map`
 * only ever needs to be passed once, on first scaffold or first retrofit.
 */
export function resolveWithMap(fullPath: string, cliFlag: boolean): boolean {
  if (cliFlag) {
    return true;
  }
  return hasMapDependency(join(fullPath, 'package.json'));
}
