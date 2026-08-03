import { resolve } from 'node:path';
import { resolveMode, resolvePluginPaths } from './paths';

function main(): void {
  const fullPathArg = process.argv[2];
  if (!fullPathArg) {
    throw new Error('Usage: soilhive-plugin <full-path>');
  }

  const fullPath = resolve(fullPathArg);
  const { root, pluginName } = resolvePluginPaths(fullPath);
  const mode = resolveMode(fullPath);

  console.log(`[soilhive-plugin] mode=${mode} pluginName="${pluginName}" root="${root}"`);
}

try {
  main();
} catch (error) {
  console.error(`[soilhive-plugin] ${(error as Error).message}`);
  process.exitCode = 1;
}
