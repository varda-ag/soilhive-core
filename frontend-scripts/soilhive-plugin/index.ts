import { resolve } from 'node:path';
import { runSoilhivePlugin } from './run';

function main(): void {
  const fullPathArg = process.argv[2];
  if (!fullPathArg) {
    throw new Error('Usage: soilhive-plugin <full-path> [--with-map]');
  }

  const withMap = process.argv.includes('--with-map');
  runSoilhivePlugin(resolve(fullPathArg), { withMap });
}

try {
  main();
} catch (error) {
  console.error(`[soilhive-plugin] ${(error as Error).message}`);
  process.exitCode = 1;
}
