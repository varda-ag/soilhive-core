import { styleText } from 'node:util';
import { resolveMode, resolvePluginPaths } from './paths';
import { scaffoldPlugin } from './scaffold';
import { syncUi } from './syncUi';
import { syncPluginTypes } from './syncPluginTypes';
import { mergeManagedDependencies } from './packageJson';

/**
 * create and sync are the same idempotent operation — re-running it against an
 * existing plugin is the sync mechanism, so both modes run this exact same sequence.
 */
export function runSoilhivePlugin(fullPath: string): void {
  const { root, pluginName } = resolvePluginPaths(fullPath);
  const mode = resolveMode(fullPath);

  console.log(`[soilhive-plugin] mode=${mode} pluginName="${pluginName}" root="${root}"`);

  scaffoldPlugin(fullPath, pluginName);
  syncUi(fullPath);
  syncPluginTypes(root);
  mergeManagedDependencies(fullPath);

  console.log();
  console.log(styleText(['bold', 'green'], `✔ ${pluginName} ready at ${fullPath}`));
  console.log();
  console.log(styleText('dim', '  npm does not support the "link:" protocol used for frontend-plugin-types — use pnpm'));
  console.log();
  console.log(`  cd ${fullPath}`);
  console.log(`  ${styleText('cyan', 'pnpm install')}`);
  console.log(`  ${styleText('cyan', 'pnpm dev')}`);
  console.log();
}
