/*
 * Publishes perf artifacts — run results from runner.ts and diff reports from
 * diff.ts — to object storage, so a run's record outlives the machine that
 * produced it. Opt-in via STORAGE_MODE=s3: with any other mode (including the
 * default `local`) the artifacts stay on local disk only and nothing here runs.
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
 * Best effort by design: a failed upload is reported but does not fail the
 * caller and does not change its exit code. The artifacts are already on local
 * disk at this point and the measurement itself is unaffected, so turning a
 * storage problem into a failed perf run would misreport a valid — and, against
 * a deployed target, expensive — measurement as invalid.
 */
export const publishPerfArtifacts = async (files: string[]): Promise<void> => {
  if (!isPerfPublishEnabled() || files.length === 0) {
    return;
  }
  let storage: FileStorage;
  let bucket: string;
  try {
    ({ storage, bucket } = getPerfResultStorage());
  } catch (err) {
    console.warn(`\n⚠ Could not configure S3 storage, artifacts kept locally only: ${err instanceof Error ? err.message : err}`);
    return;
  }
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
    }
  }
};
