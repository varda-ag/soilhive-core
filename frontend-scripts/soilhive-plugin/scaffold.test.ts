import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldPlugin } from './scaffold';

describe('scaffoldPlugin', () => {
  let tempDir: string;
  let pluginPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sh-plugin-'));
    pluginPath = join(tempDir, 'demo-plugin');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('produces the scaffold file list with the plugin name substituted, including mockContext.ts', () => {
    scaffoldPlugin(pluginPath, 'demo-plugin');

    const expectedFiles = [
      'rsbuild.config.ts',
      'module-federation.config.ts',
      'tsconfig.json',
      'pnpm-workspace.yaml',
      'src/App.tsx',
      'src/App.css',
      'src/bootstrap.tsx',
      'src/index.tsx',
      'src/env.d.ts',
      'src/components/ProviderComponent.tsx',
      'src/components/ProviderComponent.css',
      'src/mockContext.ts',
      'package.json',
    ];
    for (const relativeFile of expectedFiles) {
      expect(existsSync(join(pluginPath, relativeFile))).toBe(true);
    }

    const pkg = JSON.parse(readFileSync(join(pluginPath, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('demo-plugin');

    const pnpmWorkspace = readFileSync(join(pluginPath, 'pnpm-workspace.yaml'), 'utf-8');
    expect(pnpmWorkspace).toContain('core-js: true');
    expect(pnpmWorkspace).toContain('esbuild: true');
  });

  it('does not touch a scaffold file the dev has already modified on a later sync run', () => {
    scaffoldPlugin(pluginPath, 'demo-plugin');
    const rsbuildConfigPath = join(pluginPath, 'rsbuild.config.ts');
    const customConfig = '// dev customized this\nexport default { server: { port: 4444 } };\n';
    writeFileSync(rsbuildConfigPath, customConfig);

    scaffoldPlugin(pluginPath, 'demo-plugin');

    expect(readFileSync(rsbuildConfigPath, 'utf-8')).toBe(customConfig);
  });
});
