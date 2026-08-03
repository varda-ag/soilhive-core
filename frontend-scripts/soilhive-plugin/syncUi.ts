import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { alwaysOverwrite, copyOnceIfMissing } from './copyEngine';

const REPO_ROOT = join(__dirname, '..', '..');
const UI_SRC = join(REPO_ROOT, 'frontend', 'src', 'components', 'UI');
const STYLES_SRC = join(REPO_ROOT, 'frontend', 'src', 'styles');

export function syncUi(pluginPath: string): void {
  alwaysOverwrite(UI_SRC, join(pluginPath, 'UI'));

  const stylesDest = join(pluginPath, 'styles');
  alwaysOverwrite(join(STYLES_SRC, 'variables', '_colors.scss'), join(stylesDest, 'variables', '_colors.scss'));
  alwaysOverwrite(join(STYLES_SRC, 'variables', '_typography.scss'), join(stylesDest, 'variables', '_typography.scss'));

  copyOnceIfMissing(join(STYLES_SRC, 'base.scss'), join(stylesDest, 'base.scss'));
  copyOnceIfMissing(join(STYLES_SRC, 'fonts.scss'), join(stylesDest, 'fonts.scss'));
  copyOnceIfMissing(join(STYLES_SRC, 'variables', '_breakpoints.scss'), join(stylesDest, 'variables', '_breakpoints.scss'));

  writeGeneratedIndexScssOnceIfMissing(stylesDest);
}

/**
 * index.scss is generated rather than copied byte-for-byte: it mirrors the host's index.scss
 * but drops the prime.react.override.scss import, since that file is never synced.
 * Copy-once-then-dev-owned, same as the other design-token partials it stitches together.
 */
function writeGeneratedIndexScssOnceIfMissing(stylesDest: string): void {
  const destPath = join(stylesDest, 'index.scss');
  if (existsSync(destPath)) {
    return;
  }

  const hostIndexScss = readFileSync(join(STYLES_SRC, 'index.scss'), 'utf-8');
  const generated = hostIndexScss
    .split('\n')
    .filter(line => !line.includes('prime.react.override'))
    .join('\n')
    .replace(/\n+$/, '\n');

  writeFileSync(destPath, generated);
}
