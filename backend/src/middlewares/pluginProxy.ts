import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream } from 'stream/web';
import { PluginBackend } from '../interfaces/PluginBackend';
import { RequestData } from '../interfaces/RequestData';
import ConfigService from '../services/ConfigService';
import { getSubject } from '../utils/auth';
import { withDisconnectSignal } from '../utils/cancelable-query';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import { log } from '../utils/logger';
import { tokenValidator } from './tokenValidator';

// Only the core backend sets headers under this prefix; a caller's own are dropped.
const SOILHIVE_HEADER_PREFIX = 'x-soilhive-';
const SUBJECT_HEADER = `${SOILHIVE_HEADER_PREFIX}subject`;

const FORWARDED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

// Hop-by-hop headers describe one connection, not the message, so a proxy never passes them on.
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

// The caller's credentials stop here: the Plugin Backend gets this deployment's secret for it and
// the caller's Subject instead. fetch sets the host and negotiates the encoding itself.
const DROPPED_REQUEST_HEADERS = new Set([...HOP_BY_HOP_HEADERS, 'authorization', 'cookie', 'host', 'accept-encoding', 'expect']);

// fetch has already decoded the body, so its encoding and length no longer apply. Cookies and CORS
// headers would act on the core backend's origin, which is not the Plugin Backend's to set.
const DROPPED_RESPONSE_HEADERS = new Set([...HOP_BY_HOP_HEADERS, 'content-encoding', 'content-length', 'set-cookie']);

const BODY_TOO_LARGE = 'The request body exceeds the maximum allowed size';

// A header value holds Latin-1 at most, and a Subject is an email, which may hold any character. It
// goes percent-encoded as UTF-8, which leaves a plain ASCII address as it is.
const encodeSubject = (subject: string): string => subject.replace(/[^\x21-\x7e]|%/gu, character => encodeURIComponent(character));

// A Location on the Plugin Backend's own origin is reachable only through the core backend. Inside
// the base URL it is rewritten relative to the request, which keeps whatever prefix the browser
// reached the core backend under. Outside it there is no way back, and passing it on would only
// reveal the Plugin Backend's address, so it is left out (undefined). Any other origin, a
// presigned download say, is the browser's to follow.
const relocate = (location: string, target: URL, backend: PluginBackend, path: string): string | undefined => {
  if (!URL.canParse(location, target)) return location;
  const resolved = new URL(location, target);
  if (resolved.origin !== backend.url.origin) return location;
  if (!resolved.pathname.startsWith(backend.url.pathname)) return undefined;
  // From /plugins/{pluginId}/a/b, '../' climbs back to /plugins/{pluginId}/.
  const up = '../'.repeat(path.split('/').length - 2) || './';
  return `${up}${resolved.pathname.slice(backend.url.pathname.length)}${resolved.search}${resolved.hash}`;
};

const hasBody = (req: Request): boolean =>
  !['GET', 'HEAD'].includes(req.method) && (Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'] !== undefined);

const forward = async (req: Request, res: Response, signal: AbortSignal): Promise<void> => {
  const pluginId = req.params['pluginId'] as string;
  const backend = ConfigService.getPluginBackends().get(pluginId);
  if (!backend) {
    throw new ErrorResponse(`No Plugin Backend is registered for plugin "${pluginId}"`, StatusCodes.NOT_FOUND);
  }
  if (!FORWARDED_METHODS.has(req.method)) {
    throw new ErrorResponse(`${req.method} is not forwarded to a Plugin Backend`, StatusCodes.METHOD_NOT_ALLOWED);
  }

  // req.url is what follows /plugins/{pluginId}, query included and still percent-encoded. An
  // encoded slash or a backslash could still become a separator on the Plugin Backend's side, and
  // URL resolves dot segments, so '/../admin' would leave the base path.
  const [path] = req.url.split('?', 1);
  const target = new URL(`${backend.url.origin}${backend.url.pathname}${req.url.slice(1)}`);
  if (/%2f|%5c|\\/i.test(path!) || !target.pathname.startsWith(backend.url.pathname)) {
    throw new ErrorResponse(`Plugin API path "${path}" resolves outside the Plugin Backend`, StatusCodes.BAD_REQUEST);
  }

  // A token that is sent must be valid, so that the host renews an expired one. No token is an
  // anonymous call, and the Plugin Backend decides what an anonymous caller may do.
  if (req.headers.authorization?.startsWith('Bearer ')) {
    await tokenValidator(req, []);
  }

  // The body streams on as it arrives. A Content-Length over the limit is refused up front, and a
  // chunked body is counted on the way and stopped at the limit. The request stays open when it
  // stops, or the 413 could not reach the caller.
  const maxBodySize = ConfigService.getMaxUploadSizeBytes();
  if (Number(req.headers['content-length']) > maxBodySize) {
    throw new ErrorResponse(BODY_TOO_LARGE, StatusCodes.REQUEST_TOO_LONG);
  }
  let bodySize = 0;
  async function* body(): AsyncGenerator<Buffer> {
    for await (const chunk of req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
      bodySize += chunk.length;
      if (bodySize > maxBodySize) throw new Error(BODY_TOO_LARGE);
      yield chunk;
    }
    startTimeout();
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || DROPPED_REQUEST_HEADERS.has(name) || name.startsWith(SOILHIVE_HEADER_PREFIX)) continue;
    for (const item of [value].flat()) headers.append(name, item);
  }
  headers.set('authorization', `Bearer ${backend.secret}`);
  if (req.customData.token) headers.set(SUBJECT_HEADER, encodeSubject(getSubject(req.customData)));
  // A length with no body to send would leave the Plugin Backend waiting for one.
  const withBody = hasBody(req);
  if (!withBody) headers.delete('content-length');

  // The timeout covers the wait for the Plugin Backend to start answering once it has the whole
  // request: neither a slow upload nor a long download counts.
  const answered = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const startTimeout = () => {
    timer = setTimeout(
      () => answered.abort(new DOMException('The Plugin Backend did not answer in time', 'TimeoutError')),
      ConfigService.getPluginBackendTimeoutMs(),
    );
  };
  if (!withBody) startTimeout();
  // Node's fetch streams an async iterable body and needs duplex to do so; the DOM types it is
  // declared with know neither.
  const init: RequestInit & { duplex: 'half' } = {
    method: req.method,
    headers,
    body: withBody ? (body() as unknown as BodyInit) : null,
    duplex: 'half',
    // A redirect goes back to the caller, whose browser follows it (see relocate). Followed here, it
    // would send the core backend wherever the Plugin Backend pointed.
    redirect: 'manual',
    signal: AbortSignal.any([signal, answered.signal]),
  };
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    if (signal.aborted) throw error;
    if (bodySize > maxBodySize) throw new ErrorResponse(BODY_TOO_LARGE, StatusCodes.REQUEST_TOO_LONG);
    log.warn('Plugin Backend call failed', { pluginId, method: req.method, error: getErrorMessage((error as Error).cause ?? error) });
    if ((error as Error).name === 'TimeoutError') {
      throw new ErrorResponse('The Plugin Backend did not answer in time', StatusCodes.GATEWAY_TIMEOUT);
    }
    throw new ErrorResponse('The Plugin Backend could not be reached', StatusCodes.BAD_GATEWAY);
  } finally {
    clearTimeout(timer);
  }

  // A 401 from here would read as the core backend rejecting the user's token, and the host would
  // drop it (docs/adr/0060). From a Plugin Backend it can only mean this deployment's secret is wrong.
  if (upstream.status === StatusCodes.UNAUTHORIZED) {
    await upstream.body?.cancel();
    log.warn('Plugin Backend rejected the core backend secret', { pluginId });
    throw new ErrorResponse('The Plugin Backend rejected this deployment', StatusCodes.BAD_GATEWAY);
  }

  const location = upstream.headers.get('location');
  const relocated = location === null ? undefined : relocate(location, target, backend, path!);
  if (location !== null && relocated === undefined && upstream.status >= 300 && upstream.status < 400) {
    await upstream.body?.cancel();
    throw new ErrorResponse('The Plugin Backend redirected outside its base URL', StatusCodes.BAD_GATEWAY);
  }

  res.status(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name) && !name.startsWith('access-control-') && name !== 'location') res.setHeader(name, value);
  });
  if (relocated !== undefined) res.setHeader('Location', relocated);
  // The body is served from the core backend's origin: a browser must not sniff it into a page,
  // or run it as one there.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');

  if (!upstream.body) {
    res.end();
    return;
  }
  // Once the status is sent, a failure on either side can only cut the response short, which
  // pipeline does by destroying both streams.
  await pipeline(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>), res).catch(() => {});
};

/**
 * Forwards /plugins/{pluginId}/{path} to the Plugin Backend this deployment registered for
 * pluginId (docs/adr/0060, 0061). Mounted ahead of the body parsers, so that the body streams
 * through untouched, and outside the OpenAPI spec, whose paths cannot end in a path of any depth.
 */
export const pluginProxy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const signal = withDisconnectSignal(res);
  req.customData = { signal } as RequestData;
  try {
    await forward(req, res, signal);
  } catch (error) {
    // No one is left to answer once the caller is gone.
    if (!signal.aborted) next(error);
  }
};
