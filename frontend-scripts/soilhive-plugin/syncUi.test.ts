import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncUi } from './syncUi';

const REPO_ROOT = join(__dirname, '..', '..');
const UI_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'UI');

function listFilesRecursive(dir: string, base = dir): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listFilesRecursive(fullPath, base));
    } else {
      files.push(fullPath.slice(base.length + 1));
    }
  }
  return files.sort();
}

describe('syncUi', () => {
  let tempDir: string;
  let pluginPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
    pluginPath = join(tempDir, 'demo-plugin');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('makes <plugin>/UI/ byte-match frontend/src/components/UI/', () => {
    syncUi(pluginPath);

    const uiDest = join(pluginPath, 'UI');
    const sourceFiles = listFilesRecursive(UI_SRC);
    const destFiles = listFilesRecursive(uiDest);
    expect(destFiles).toEqual(sourceFiles);

    for (const relativeFile of sourceFiles) {
      expect(readFileSync(join(uiDest, relativeFile), 'utf-8')).toBe(readFileSync(join(UI_SRC, relativeFile), 'utf-8'));
    }
  });

  it('discards a hand-edit inside <plugin>/UI/Button/Button.tsx on the next sync', () => {
    syncUi(pluginPath);

    const buttonPath = join(pluginPath, 'UI', 'Button', 'Button.tsx');
    const originalContent = readFileSync(buttonPath, 'utf-8');
    writeFileSync(buttonPath, '// hand-edited by a plugin dev\n');
    expect(readFileSync(buttonPath, 'utf-8')).not.toBe(originalContent);

    syncUi(pluginPath);

    expect(readFileSync(buttonPath, 'utf-8')).toBe(originalContent);
  });

  it('generates styles/index.scss without the never-copied prime.react.override.scss import', () => {
    syncUi(pluginPath);

    const indexScss = readFileSync(join(pluginPath, 'styles', 'index.scss'), 'utf-8');
    expect(indexScss).not.toContain('prime.react.override');
    expect(indexScss).toContain("@import './variables/colors'");
    expect(indexScss).toContain("@import './base.scss'");
  });

  it('leaves a hand-edited styles/index.scss untouched on the next sync (copy-once, dev-owned)', () => {
    syncUi(pluginPath);

    const indexScssPath = join(pluginPath, 'styles', 'index.scss');
    const customContent = "@import './base.scss';\n// dev customized this\n";
    writeFileSync(indexScssPath, customContent);

    syncUi(pluginPath);

    expect(readFileSync(indexScssPath, 'utf-8')).toBe(customContent);
  });
});
