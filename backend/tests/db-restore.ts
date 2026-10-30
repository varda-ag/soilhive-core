import { pgRestore } from 'pg-dump-restore';
import { getDBPassword } from '../src/utils/db-credentials';

/**
 * Restores a raster filter fixture dump into the schema it was dumped from. Test-only since the
 * --load-raster-filter CLI was removed (docs/adr/0067).
 */
export const dbRestore = async (dumpPath: string): Promise<void> => {
  await pgRestore(
    {
      host: process.env.POSTGRES_HOST!,
      port: Number(process.env.POSTGRES_PORT!),
      username: process.env.POSTGRES_USER!,
      password: await getDBPassword(),
      database: process.env.POSTGRES_DB!,
    },
    {
      filePath: dumpPath,
      clean: true, // Clean table if exists
      create: false, // DB creation
      ifExists: true, // Cleans only if exists
      noOwner: true, // Skips ALTER/OWNER
      noPrivileges: true, // Skips GRANT/REVOKE
    },
  );
};
