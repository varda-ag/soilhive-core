import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMode, resolvePluginPaths } from './paths';

describe('resolvePluginPaths', () => {
  it('splits a full path into root and pluginName', () => {
    expect(resolvePluginPaths('/tmp/root/my-plugin')).toEqual({
      fullPath: '/tmp/root/my-plugin',
      root: '/tmp/root',
      pluginName: 'my-plugin',
    });
  });
});

describe('resolveMode', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves to create when the target path does not exist', () => {
    const fullPath = join(tempDir, 'my-plugin');
    expect(resolveMode(fullPath)).toBe('create');
  });

  it('errors out when the target exists but package.json is not plugin-shaped', () => {
    const fullPath = join(tempDir, 'not-a-plugin');
    mkdirSync(fullPath);
    writeFileSync(join(fullPath, 'package.json'), JSON.stringify({ name: 'not-a-plugin', dependencies: {} }));

    expect(() => resolveMode(fullPath)).toThrow();
  });
});
