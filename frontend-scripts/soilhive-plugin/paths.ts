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
