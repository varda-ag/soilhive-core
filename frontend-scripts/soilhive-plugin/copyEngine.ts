import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/**
 * Assets that must never be copied into a plugin, regardless of any opt-in flag.
 */
const NEVER_COPY_BASENAMES = new Set(['prime.react.override.scss']);

/**
 * Assets only copyable when the caller explicitly allows map assets (i.e. --with-map).
 */
const MAP_ONLY_BASENAMES = new Set(['SoilhiveMap.scss']);

export interface CopyOptions {
  /** Allows copying assets otherwise blocked unless a plugin explicitly opts into the map. */
  allowMapAssets?: boolean;
  /** Extra basenames (files or whole directories) to exclude from this copy. */
  excludeBasenames?: string[];
}

function isForbidden(path: string, options: CopyOptions): boolean {
  const name = basename(path);
  if (NEVER_COPY_BASENAMES.has(name)) return true;
  if (MAP_ONLY_BASENAMES.has(name) && !options.allowMapAssets) return true;
  if (options.excludeBasenames?.includes(name)) return true;
  return false;
}

export function neverCopy(path: string, options: CopyOptions = {}): void {
  if (isForbidden(path, options)) {
    throw new Error(`"${basename(path)}" must never be copied into a plugin`);
  }
}

function copyFilter(options: CopyOptions) {
  return (source: string) => !isForbidden(source, options);
}

/** Host is authoritative: destination is fully replaced with source on every run. */
export function alwaysOverwrite(src: string, dest: string, options: CopyOptions = {}): void {
  neverCopy(src, options);
  if (resolve(src) === resolve(dest)) {
    throw new Error(`Refusing to overwrite "${dest}": it resolves to the same path as its source.`);
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true, filter: copyFilter(options) });
}

/** Dev-owned after creation: only copied the first time, never touched again. */
export function copyOnceIfMissing(src: string, dest: string, options: CopyOptions = {}): void {
  if (existsSync(dest)) {
    return;
  }
  neverCopy(src, options);
  cpSync(src, dest, { recursive: true, filter: copyFilter(options) });
}
