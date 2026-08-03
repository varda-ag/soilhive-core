import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alwaysOverwrite, copyOnceIfMissing, neverCopy } from './copyEngine';

describe('alwaysOverwrite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('replaces destination directory contents, including removing stale files', () => {
    const srcDir = join(tempDir, 'src');
    const destDir = join(tempDir, 'dest');
    mkdirSync(srcDir);
    mkdirSync(destDir);
    writeFileSync(join(srcDir, 'a.txt'), 'new');
    writeFileSync(join(destDir, 'a.txt'), 'old');
    writeFileSync(join(destDir, 'stale.txt'), 'should be removed');

    alwaysOverwrite(srcDir, destDir);

    expect(readdirSync(destDir).sort()).toEqual(['a.txt']);
    expect(readFileSync(join(destDir, 'a.txt'), 'utf-8')).toBe('new');
  });
});

describe('copyOnceIfMissing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('leaves an existing destination file untouched even if content differs from source', () => {
    const srcFile = join(tempDir, 'src.txt');
    const destFile = join(tempDir, 'dest.txt');
    writeFileSync(srcFile, 'new content');
    writeFileSync(destFile, 'old content');

    copyOnceIfMissing(srcFile, destFile);

    expect(readFileSync(destFile, 'utf-8')).toBe('old content');
  });
});

describe('neverCopy', () => {
  it('throws when asked to copy a forbidden asset', () => {
    expect(() => neverCopy('/some/path/SoilhiveMap.scss')).toThrow();
    expect(() => neverCopy('/some/path/prime.react.override.scss')).toThrow();
  });

  it('does not throw for a non-forbidden path', () => {
    expect(() => neverCopy('/some/path/base.scss')).not.toThrow();
  });
});
