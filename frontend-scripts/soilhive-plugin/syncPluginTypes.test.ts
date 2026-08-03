import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncPluginTypes } from './syncPluginTypes';

const REPO_ROOT = join(__dirname, '..', '..');
const PLUGIN_TYPES_SRC = join(REPO_ROOT, 'frontend-plugin-types');

describe('syncPluginTypes', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sh-plugin-root-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates <root>/frontend-plugin-types/ once and reuses it for a second plugin under the same root', () => {
    syncPluginTypes(root);
    const destDir = join(root, 'frontend-plugin-types');
    const sourceFiles = readdirSync(PLUGIN_TYPES_SRC).sort();
    expect(readdirSync(destDir).sort()).toEqual(sourceFiles);

    // a second plugin under the same root triggers the same sync target, not a duplicate
    syncPluginTypes(root);
    expect(readdirSync(root).sort()).toEqual(['frontend-plugin-types']);
    expect(readdirSync(destDir).sort()).toEqual(sourceFiles);
  });

  it('always overwrites local edits to <root>/frontend-plugin-types/', () => {
    syncPluginTypes(root);
    const indexPath = join(root, 'frontend-plugin-types', 'index.ts');
    const originalContent = readFileSync(indexPath, 'utf-8');
    writeFileSync(indexPath, '// locally edited\n');

    syncPluginTypes(root);

    expect(readFileSync(indexPath, 'utf-8')).toBe(originalContent);
  });
});
