import fs from 'fs';
import path from 'path';
import { setupTestEnv, tmpDirForWorker } from './environment';
import { writableAssets } from './assets';

/**
 * Runs once per test file, before the test framework and before any module under test is loaded.
 *
 * Both jobs here have to happen this early. POSTGRES_SCHEMA is worker-dependent but workers
 * inherit globalSetup's value at fork time, so it has to be corrected before anything reads it --
 * PgBoss.ts, for one, derives PG_BOSS_SCHEMA from it at import time. And TMPDIR has to be
 * redirected before any module caches a path under it, so that concurrently running workers do
 * not see each other's GDAL and export scratch files in os.tmpdir().
 */
const tmpDir = tmpDirForWorker();
fs.mkdirSync(tmpDir, { recursive: true });
process.env['TMPDIR'] = tmpDir;

setupTestEnv();

// Materialised eagerly, and advertised through the environment
process.env['SOILHIVE_TEST_ASSETS'] = path.dirname(writableAssets('raster'));
