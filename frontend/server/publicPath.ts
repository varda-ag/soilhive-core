import { BASE_PATH } from '../src/configuration/basePath';

// Rspack replaces this with the bundle's public path variable.
declare let __webpack_public_path__: string;

// Assets imported by URL (such as the logo) get their URL when their module
// first runs, so the server must import this module before the pages. Then a
// server-rendered asset URL is under APP_BASE_PATH, as in the browser, and the
// build doesn't depend on the path (ADR 0084).
// eslint-disable-next-line prefer-const -- sets Rspack's variable, which can't be a const
__webpack_public_path__ = `${BASE_PATH}/`;
