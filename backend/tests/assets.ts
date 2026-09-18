import fs from 'fs';
import path from 'path';
import { tmpDirForWorker } from './environment';

const REPO_ASSETS = path.join(__dirname, 'assets');

/**
 * A writable copy of an asset directory, private to this Jest worker.
 * Copied once per worker and reused, so files in the same worker see the directory in the state
 * the previous file left it, exactly as they did when it was the repository's copy.
 */
export const writableAssets = (relativePath: string): string => {
  const target = path.join(tmpDirForWorker(), 'assets', relativePath);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(REPO_ASSETS, relativePath), target, { recursive: true });
  }
  return target;
};

/** A writable copy of a single asset file, private to this Jest worker. */
export const writableAsset = (relativePath: string): string =>
  path.join(writableAssets(path.dirname(relativePath)), path.basename(relativePath));

/** A directory for a test's own output, private to this Jest worker and created on demand. */
export const workerOutputDir = (name: string): string => {
  const dir = path.join(tmpDirForWorker(), 'output', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
