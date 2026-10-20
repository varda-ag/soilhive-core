import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Config } from './config.js';
import { cors } from './cors.js';
import { createPluginTokenVerifier, pluginUser, type VerifierOptions } from './pluginToken.js';

// Method, path and status only: never a header, so never the Authorization token or a Cookie
const requestLog: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }));
  });
  next();
};

export const createApp = (config: Config, options: VerifierOptions = {}) => {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors);
  app.use(requestLog);

  const { optionalPluginToken, requirePluginToken } = createPluginTokenVerifier(config, options);

  // Open to everyone; a signed-in user's call still carries a token, which must be valid
  app.get('/api/public', optionalPluginToken, (_req, res) => {
    res.json({ message: `Hello from ${config.pluginId}`, signedIn: pluginUser(res) !== undefined });
  });

  app.get('/api/me', requirePluginToken, (_req, res) => {
    const user = pluginUser(res)!;
    res.json({ subject: user.subject, scopes: user.scopes });
  });

  // Reads the core as the user: the same token, sent back to the core, sees exactly the datasets the
  // user may see. The core refuses it for anything but a read.
  app.get('/api/datasets', requirePluginToken, async (_req, res, next) => {
    try {
      const core = await fetch(`${config.coreInternalUrl}/datasets`, { headers: { Authorization: `Bearer ${pluginUser(res)!.token}` } });
      res.status(core.status).type(core.headers.get('Content-Type') ?? 'application/json');
      res.send(Buffer.from(await core.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  });

  // A user this backend turns away gets a 403, never a 401: a 401 makes the host renew the token
  app.get('/api/admin-only', requirePluginToken, (_req, res) => {
    if (!pluginUser(res)!.scopes.includes('super-admin')) {
      res.status(403).json({ detail: 'Only a super-admin may see this' });
      return;
    }
    res.json({ secret: 42 });
  });

  if (config.staticDir) {
    app.use(express.static(config.staticDir));
  }

  app.use((_req, res) => {
    res.status(404).json({ detail: 'Not found' });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error(error instanceof Error ? error.message : error);
    res.status(500).json({ detail: 'Internal error' });
  };
  app.use(errorHandler);

  return app;
};
