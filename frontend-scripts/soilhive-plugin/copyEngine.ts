import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/**
 * Assets that must never be copied into a plugin.
 */
const NEVER_COPY_BASENAMES = new Set(['SoilhiveMap.scss', 'prime.react.override.scss']);

export function neverCopy(path: string): void {
  const name = basename(path);
  if (NEVER_COPY_BASENAMES.has(name)) {
    throw new Error(`"${name}" must never be copied into a plugin`);
  }
}

function copyFilter(source: string): boolean {
  return !NEVER_COPY_BASENAMES.has(basename(source));
}

/** Host is authoritative: destination is fully replaced with source on every run. */
export function alwaysOverwrite(src: string, dest: string): void {
  neverCopy(src);
  if (resolve(src) === resolve(dest)) {
    throw new Error(`Refusing to overwrite "${dest}": it resolves to the same path as its source.`);
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true, filter: copyFilter });
}

/** Dev-owned after creation: only copied the first time, never touched again. */
export function copyOnceIfMissing(src: string, dest: string): void {
  if (existsSync(dest)) {
    return;
  }
  neverCopy(src);
  cpSync(src, dest, { recursive: true, filter: copyFilter });
}
