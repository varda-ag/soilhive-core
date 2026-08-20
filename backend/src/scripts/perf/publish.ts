/*
 * Publishes perf artifacts — run results from runner.ts and diff reports from
 * diff.ts — to object storage, so a run's record outlives the machine that
 * produced it. Opt-in via STORAGE_MODE=s3: with any other mode (including the
 * default `local`) the artifacts stay on local disk only and nothing here runs.
 *
 * It also reads back: `listPerfRunNames` and `fetchPerfArtifact` let diff.ts
 * select a baseline from the bucket when the local directory holds only the run
 * just written, which is the normal state in a container (docs/adr/0029). Those
 * two deliberately let their errors escape, unlike the upload path: a bucket
 * that cannot be listed must not be indistinguishable from a bucket holding no
 * eligible baseline, since the first is a broken deployment and the second is
 * simply a first run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import { AwsS3StorageAdapter } from '@flystorage/aws-s3';
import { FileStorage } from '@flystorage/file-storage';
import { S3StorageConfig } from '../../interfaces/StorageConfig';
import ConfigService from '../../services/ConfigService';
import { StorageModes } from '../../types/enums';

/**
 * Prefix every artifact is written under, relative to the **bucket root** — so
 * deliberately outside S3_STORAGE_ROOT_FOLDER, where the application's own
 * uploads live. Perf artifacts are tooling output rather than soil data, and
 * keeping them out of the data prefix means an IAM policy or lifecycle rule
 * scoped to one does not silently apply to the other. The flip side is that
 * anything scoped to the data prefix does not cover these either.
 */
const PERF_RESULTS_PREFIX = 'perf-results';

const MIME_TYPES: Record<string, string> = { '.json': 'application/json', '.html': 'text/html; charset=utf-8' };

/** True when perf artifacts should be published as well as written locally. */
export const isPerfPublishEnabled = (): boolean => (process.env['STORAGE_MODE'] ?? '') === StorageModes.S3;

/**
 * True when publishing is the point rather than a bonus, so a failed upload is
 * a failed run. Set by the perf image, because this module's best-effort
 * rationale — "the artifacts are already on local disk" — is false in a
 * container, where that disk dies with the process (docs/adr/0029). Off by
 * default, so a developer's run is unaffected.
 */
export const isPerfPublishRequired = (): boolean => process.env['PERF_REQUIRE_PUBLISH'] === 'true';

/**
 * Built from ConfigService.getStorageConfig() rather than by reading the S3
 * env vars here: endpoint handling (forcePathStyle for MinIO) and the explicit
 * credentials fallback are easy to get subtly different, and two readers of the
 * same variables is how they drift. The cost is that its assertion also requires
 * S3_STORAGE_ROOT_FOLDER, which this path does not use — a set-and-forget
 * variable in exchange for configuration that cannot diverge from the app's.
 */
const getPerfResultStorage = (): { storage: FileStorage; bucket: string } => {
  const { config } = ConfigService.getStorageConfig();
  const s3Config = config as S3StorageConfig;
  const client = new S3Client({
    region: s3Config.region,
    ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
    ...(s3Config.credentials ? { credentials: s3Config.credentials } : {}),
  });
  // Prefix, not a key built by hand, so a file name can never escape the folder.
  const adapter = new AwsS3StorageAdapter(client as never, { bucket: s3Config.bucketName, prefix: PERF_RESULTS_PREFIX });
  return { storage: new FileStorage(adapter), bucket: s3Config.bucketName };
};

/**
 * Uploads each file under its own basename, keeping the object key recognisable
 * as the local file it came from. Run artifacts are named
 * <ISO-timestamp>-<sha>.{json,html}, so they are unique per run and sort
 * chronologically in a bucket listing.
 *
 * Best effort by design: a failed upload is reported but never throws, so a
 * storage problem cannot turn a valid — and, against a deployed target,
 * expensive — measurement into an aborted run. What it does do is *report* the
 * outcome: the returned boolean is false when anything did not make it, which
 * is how a caller running under `isPerfPublishRequired()` turns the same
 * failure into a non-zero exit without this function having to know why.
 *
 * Publishing being disabled counts as success, not failure: nothing was asked
 * of it. A caller that requires publishing must check `isPerfPublishEnabled()`
 * as a precondition instead, ideally before it spends anything measuring.
 */
export const publishPerfArtifacts = async (files: string[]): Promise<boolean> => {
  if (!isPerfPublishEnabled() || files.length === 0) {
    return true;
  }
  let storage: FileStorage;
  let bucket: string;
  try {
    ({ storage, bucket } = getPerfResultStorage());
  } catch (err) {
    console.warn(`\n⚠ Could not configure S3 storage, artifacts kept locally only: ${err instanceof Error ? err.message : err}`);
    return false;
  }
  let allPublished = true;
  for (const file of files) {
    const name = path.basename(file);
    try {
      const mimeType = MIME_TYPES[path.extname(name).toLowerCase()];
      // Read whole rather than streamed: these are bounded report files, and a
      // buffer keeps the upload's success or failure unambiguous instead of
      // splitting it between the read stream and the write.
      await storage.write(name, await fs.promises.readFile(file), { ...(mimeType ? { mimeType } : {}) });
      console.log(`S3:    s3://${bucket}/${PERF_RESULTS_PREFIX}/${name}`);
    } catch (err) {
      console.warn(`⚠ Upload of ${name} failed, it is kept locally only: ${err instanceof Error ? err.message : err}`);
      allPublished = false;
    }
  }
  return allPublished;
};

/**
 * Names of the published run files, newest first. Run artifacts are named
 * <ISO-timestamp>-<sha>.json, so a reverse lexicographic sort is reverse
 * chronological — the same property findLastTwoRuns relies on when it sorts a
 * directory listing.
 *
 * The `.json` filter is what separates run files from diff reports, which are
 * only ever published as `.html`. Errors are *not* caught here — see the module
 * comment.
 */
export const listPerfRunNames = async (): Promise<string[]> => {
  if (!isPerfPublishEnabled()) {
    return [];
  }
  const { storage } = getPerfResultStorage();
  const entries = await storage.list('').toArray();
  return entries
    .filter(entry => entry.isFile && entry.path.endsWith('.json'))
    .map(entry => path.basename(entry.path))
    .sort()
    .reverse();
};

/**
 * Downloads one published artifact into `destDir` under its own name and
 * returns the local path. Errors are not caught — see the module comment.
 */
export const fetchPerfArtifact = async (name: string, destDir: string): Promise<string> => {
  const { storage } = getPerfResultStorage();
  const contents = await storage.readToBuffer(name);
  await fs.promises.mkdir(destDir, { recursive: true });
  // basename, so a key from the listing can never write outside destDir
  const localPath = path.join(destDir, path.basename(name));
  await fs.promises.writeFile(localPath, contents);
  return localPath;
};
