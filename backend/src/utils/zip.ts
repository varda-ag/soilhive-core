import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';

const { S_IFMT, S_IFDIR, S_IFLNK } = fs.constants;

/**
 * Replaces the `extract-zip` package, whose yauzl 2 hangs on Node 26.
 * Skips `__MACOSX/` metadata and symlinks: an uploaded archive must not point a data file elsewhere on the host.
 * yauzl rejects absolute and `..` entry names, so nothing is written outside `dir`.
 */
export const extractZip = async (zipPath: string, { dir }: { dir: string }): Promise<void> => {
  await fs.promises.mkdir(dir, { recursive: true });
  const zipfile = await yauzl.openPromise(zipPath);

  for await (const entry of zipfile.eachEntry()) {
    if (entry.fileName.startsWith('__MACOSX/')) {
      continue;
    }
    const type = (entry.externalFileAttributes >>> 16) & S_IFMT;
    if (type === S_IFLNK) {
      continue;
    }
    // Some Windows tools mark directories only with the DOS attribute, without a trailing slash
    const isDir =
      entry.fileName.endsWith('/') || type === S_IFDIR || (entry.versionMadeBy >> 8 === 0 && entry.externalFileAttributes === 16);

    const dest = path.join(dir, entry.fileName);
    await fs.promises.mkdir(isDir ? dest : path.dirname(dest), { recursive: true });
    if (!isDir) {
      await pipeline(await zipfile.openReadStreamPromise(entry), fs.createWriteStream(dest));
    }
  }
};
