import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMode, resolvePluginPaths, resolveWithMap } from './paths';

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

describe('resolveWithMap', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('is true when the --with-map flag is passed, regardless of the plugin state', () => {
    const fullPath = join(tempDir, 'fresh-plugin');
    expect(resolveWithMap(fullPath, true)).toBe(true);
  });

  it('is false for a fresh (non-existent) path when the flag is not passed', () => {
    const fullPath = join(tempDir, 'fresh-plugin');
    expect(resolveWithMap(fullPath, false)).toBe(false);
  });

  it('is true without the flag when the plugin already opted in previously (react-map-gl present)', () => {
    const fullPath = join(tempDir, 'map-plugin');
    mkdirSync(fullPath);
    writeFileSync(
      join(fullPath, 'package.json'),
      JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0', 'react-map-gl': '8.1.0' } }),
    );

    expect(resolveWithMap(fullPath, false)).toBe(true);
  });

  it('is false without the flag when the plugin exists but never opted into the map', () => {
    const fullPath = join(tempDir, 'plain-plugin');
    mkdirSync(fullPath);
    writeFileSync(join(fullPath, 'package.json'), JSON.stringify({ dependencies: { react: '19.2.0', 'react-dom': '19.2.0' } }));

    expect(resolveWithMap(fullPath, false)).toBe(false);
  });
});
