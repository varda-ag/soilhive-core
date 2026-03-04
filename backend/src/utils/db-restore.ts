import path from 'path';
import { pgRestore } from 'pg-dump-restore';
import { getDBPassword } from './db-credentials';
import { getDataSource } from './data-source';
import { readFileSync } from 'fs';
import { isJest } from './utils';

export const dbRestore = async (dumpPath: string, mappingsPath?: string): Promise<void> => {
  // Create soilhive schema if needed
  const dataSource = await getDataSource();
  dataSource.query('CREATE SCHEMA IF NOT EXISTS soilhive;');

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

  const schema = process.env.POSTGRES_SCHEMA;
  if (schema !== 'soilhive' && !isJest()) {
    // Move table to custom schema
    const table = path.parse(dumpPath).name;
    dataSource.query(`ALTER TABLE soilhive.${table} SET SCHEMA ${schema};`);
  }

  if (!mappingsPath) {
    return;
  }

  const sql = readFileSync(mappingsPath, 'utf8');
  await dataSource.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
  await dataSource.query(sql);
};
