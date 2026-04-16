/**
 * Preloaded via --import so the SCSS hook is registered before any module is
 * loaded.  Used only in dev mode (tsx watch server/index.ts).
 */
import { register } from 'node:module';
register('./scss-hook.js', import.meta.url);
