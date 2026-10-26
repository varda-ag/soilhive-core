import { Request, Response, NextFunction } from 'express';
import { getDataSource } from '../utils/data-source';
import { withDisconnectSignal } from '../utils/cancelable-query';

const skip = ['/health', '/ready', '/docs', '/openapi.json', '/oauth'];

// Soil Index tile reads run single pooled queries of their own, under a per-node cap (docs/adr/0043).
// A map view fires dozens at once, and each would otherwise hold a connection and a transaction.
const skipSoilIndexTiles = /^(\/api\/v1)?\/soil-indexes\/[^/]+\/(tiles|scores)(\/|$)/;

// Multipart uploads stream the file to storage before their first query, and POST /files then probes
// it with GDAL: minutes for a large file, longer than idle_in_transaction_session_timeout. They run on
// the pool's default manager instead, so no connection is held meanwhile; createFile opens a short
// transaction of its own for the insert.
const skipUploadRoutes = /^(\/api\/v1)?\/(files|frontend\/logo)\/?$/;

export const transactionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Every request gets a disconnect signal, not just endpoints that currently borrow pooled
  // connections (see runCancelableQuery/ADR 0036): it costs one extra `res.on('close', ...)`
  // listener (additive - doesn't interfere with this middleware's own cleanup below) and
  // means any future endpoint can opt into that pattern via `requestData.signal` without
  // having to wire its own signal per controller.
  const signal = withDisconnectSignal(res);

  if (skip.some(p => req.path.startsWith(p)) || (req.method === 'GET' && skipSoilIndexTiles.test(req.path))) {
    req.customData = req.customData || ({ signal } as typeof req.customData);
    return next();
  }

  const dataSource = await getDataSource();

  if (req.method === 'POST' && skipUploadRoutes.test(req.path)) {
    req.customData = req.customData || ({ entityManager: dataSource.manager, signal } as typeof req.customData);
    return next();
  }

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  // Get the PID for this request connection only
  const [{ pid: backendPid }] = await queryRunner.query('SELECT pg_backend_pid() as pid');

  // Awaited before the request's connection is released, so a late cancel can never hit the backend
  // after the pool has handed it to another request. On an exhausted pool the connect gives up after
  // the pool's connectionTimeoutMillis rather than holding this request's connection indefinitely.
  const cancelBackend = async () => {
    const cancelRunner = dataSource.createQueryRunner();
    try {
      await cancelRunner.connect();
      await cancelRunner.query('SELECT pg_cancel_backend($1)', [backendPid]);
    } catch {
      // best-effort; ignore if the backend already finished or no connection was free
    } finally {
      await cancelRunner.release().catch(() => {});
    }
  };

  await queryRunner.startTransaction();
  req.customData = req.customData || { entityManager: queryRunner.manager, signal };

  if (req.method === 'GET') {
    res.on('close', async () => {
      if (!res.writableEnded) await cancelBackend();
      try {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }
    });

    return next();
  }

  let cleaned = false;

  const cleanup = async (shouldCommit: boolean) => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (shouldCommit) {
        await queryRunner.commitTransaction();
      } else {
        await queryRunner.rollbackTransaction();
      }
    } catch {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  };

  // --- Intercept res.write / res.end so the commit finishes before any bytes
  //     leave the server.  All writes are buffered; once the commit (or
  //     rollback) completes they are replayed in order.  This eliminates the
  //     race where a subsequent request reads data that has not been committed
  //     yet (and also fixes streaming responses such as file downloads that
  //     call res.write multiple times before res.end). ---

  const origWrite = res.write.bind(res) as typeof res.write;
  const origEnd = res.end.bind(res) as typeof res.end;

  type PendingCall = { fn: typeof origWrite | typeof origEnd; args: any[] };
  const pending: PendingCall[] = [];
  let flushStarted = false;

  const startFlush = () => {
    if (flushStarted) return;
    flushStarted = true;

    const shouldCommit = res.statusCode >= 200 && res.statusCode < 400;

    cleanup(shouldCommit)
      .catch(() => {
        // cleanup already rolls back in its own catch; nothing extra to do
      })
      .finally(() => {
        // Restore originals so the replay goes straight to the socket
        res.write = origWrite;
        res.end = origEnd;
        for (const call of pending) {
          (call.fn as (...args: any[]) => any).apply(res, call.args);
        }
      });
  };

  res.write = function (...args: any[]): boolean {
    pending.push({ fn: origWrite, args });
    startFlush();
    // Immediately acknowledge to unblock any pipe/stream on the caller side.
    // All data is buffered in `pending` until the commit finishes.
    const cb = args.find(a => typeof a === 'function');
    if (cb) cb();
    return true;
  };

  res.end = function (...args: any[]): Response {
    pending.push({ fn: origEnd, args });
    startFlush();
    return res;
  };

  // --- Safety net: if the connection closes before res.end is ever called
  //     (e.g. client disconnect, or a route that never responds) always roll
  //     back so we never leave an open transaction. ---
  res.on('close', async () => {
    if (!cleaned) {
      if (!res.writableEnded) await cancelBackend();
      await cleanup(false);
    }
  });

  next();
};
