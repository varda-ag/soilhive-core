import { join } from 'node:path';
import { alwaysOverwrite } from './copyEngine';

const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_TYPES_SRC = join(REPO_ROOT, 'frontend-plugin-types');

/**
 * Shared once per root — every plugin under `root` points at this same
 * `<root>/frontend-plugin-types/`, regardless of which plugin's run triggered the sync.
 */
export function syncPluginTypes(root: string): void {
  alwaysOverwrite(PLUGIN_TYPES_SRC, join(root, 'frontend-plugin-types'));
}
