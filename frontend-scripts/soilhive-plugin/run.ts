import { styleText } from 'node:util';
import { join } from 'node:path';
import { resolveMode, resolvePluginPaths, resolveWithMap } from './paths';
import { scaffoldPlugin } from './scaffold';
import { syncUi } from './syncUi';
import { syncPluginTypes } from './syncPluginTypes';
import { syncMap } from './syncMap';
import { mergeManagedDependencies } from './packageJson';

export interface RunSoilhivePluginOptions {
  withMap?: boolean;
}

/**
 * create and sync are the same idempotent operation — re-running it against an
 * existing plugin is the sync mechanism, so both modes run this exact same sequence.
 */
export function runSoilhivePlugin(fullPath: string, options: RunSoilhivePluginOptions = {}): void {
  const { root, pluginName } = resolvePluginPaths(fullPath);
  const mode = resolveMode(fullPath);
  const withMap = resolveWithMap(fullPath, options.withMap ?? false);

  console.log(`[soilhive-plugin] mode=${mode} pluginName="${pluginName}" root="${root}"${withMap ? ' withMap=true' : ''}`);

  scaffoldPlugin(fullPath, pluginName);
  syncUi(fullPath);
  syncPluginTypes(root);

  if (withMap) {
    syncMap(fullPath);
  }

  mergeManagedDependencies(
    fullPath,
    withMap
      ? {
          // Scan the plugin's own already-vendored output rather than the host source: syncMap
          // has already excluded AreaInfo/UploadPolygonModal/MapStyleSwitcher, so this reflects
          // exactly what's actually there, no need to re-derive the same exclusions here. Map/'s
          // cross-cutting files (DrawControl.tsx, hooks/, utilities/, types/, configuration/) all
          // live nested under Map/_shared/ now, so scanning Map/ alone covers them too.
          extraScanPaths: [join(fullPath, 'Map')],
        }
      : {},
  );

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
