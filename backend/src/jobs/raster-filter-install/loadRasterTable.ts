import { spawn, ChildProcess } from 'child_process';
import { getDBPassword, SSL_ROOT_CERT_PATH } from '../../utils/db-credentials';
import { RASTER_FILTER_OVERVIEW_FACTORS } from '../../utils/raster';
import { log } from '../../utils/logger';

// The tile size the CLI's dumps were built with
const TILE_SIZE = '256x256';

const ROWS_PER_COPY = '1000';

/**
 * Loads a single-band EPSG:4326 raster into `<schema>.<table>`, with its overview tables, spatial
 * indexes and raster constraints (the max extent one excepted: it scans the whole table).
 *
 * raster2pgsql writes hex WKB, about twice the raster's size, so it is piped straight into psql rather
 * than through a file. The whole load is one transaction: raster2pgsql wraps it in BEGIN/END.
 */
export async function loadRasterTable(rasterPath: string, schema: string, table: string): Promise<void> {
  // Before spawning: a spawn failure is emitted on the next tick, and must find its listener
  const env = { ...process.env, ...(await psqlEnv()) };
  const raster2pgsql = spawn('raster2pgsql', [
    '-s',
    '4326',
    '-t',
    TILE_SIZE,
    '-l',
    RASTER_FILTER_OVERVIEW_FACTORS.join(','),
    '-I',
    '-C',
    '-x',
    '-Y',
    ROWS_PER_COPY,
    rasterPath,
    `${schema}.${table}`,
  ]);
  const psql = spawn('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], { env });
  const results = Promise.all([finished(raster2pgsql, 'raster2pgsql'), finished(psql, 'psql')]);

  raster2pgsql.stdout.pipe(psql.stdin);
  // psql exiting early on an error closes the pipe; its exit code reports why
  psql.stdin.on('error', () => {});
  // The SELECT results of AddRasterConstraints: read and dropped so psql never blocks on a full pipe
  psql.stdout.resume();

  const [loader, client] = await results;
  for (const result of [client, loader]) {
    if (result.error) {
      throw new Error(result.error);
    }
  }
}

/** The connection psql makes, the same one the app's pool makes. */
async function psqlEnv(): Promise<NodeJS.ProcessEnv> {
  return {
    PGHOST: process.env.POSTGRES_HOST!,
    PGPORT: process.env.POSTGRES_PORT!,
    PGUSER: process.env.POSTGRES_USER!,
    PGDATABASE: process.env.POSTGRES_DB!,
    PGPASSWORD: await getDBPassword(),
    // The overviews, indexes and constraints take long on a global raster
    PGOPTIONS: '-c statement_timeout=0',
    // IAM authentication, as in getDataSource
    ...(process.env.POSTGRES_PASSWORD ? {} : { PGSSLMODE: 'verify-full', PGSSLROOTCERT: SSL_ROOT_CERT_PATH }),
  };
}

function finished(proc: ChildProcess, cmd: string): Promise<{ error?: string }> {
  let stderr = '';
  proc.stderr?.on('data', chunk => {
    stderr += chunk;
  });
  return new Promise(resolve => {
    proc.on('error', (error: NodeJS.ErrnoException) => {
      resolve({ error: error.code === 'ENOENT' ? `${cmd} not found on this server` : `Failed to run ${cmd}: ${error.message}` });
    });
    proc.on('close', code => {
      if (code === 0) {
        resolve({});
        return;
      }
      log.warn('Raster filter load command failed', { cmd, code, stderr: stderr.trim() });
      resolve({ error: `${cmd} failed (exit ${code}): ${stderr.trim().split('\n').slice(-5).join('\n')}` });
    });
  });
}
