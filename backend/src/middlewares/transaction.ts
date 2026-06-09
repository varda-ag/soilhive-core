import { Request, Response, NextFunction } from 'express';
import { getDataSource } from '../utils/data-source';

const skip = ['/health', '/ready', '/docs', '/openapi.json'];

export const transactionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (skip.some(p => req.path.startsWith(p))) {
    return next();
  }

  const dataSource = await getDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  // Get the PID for this request connection only
  const [{ pid: backendPid }] = await queryRunner.query('SELECT pg_backend_pid() as pid');

  const cancelBackend = async () => {
    try {
      const cancelRunner = dataSource.createQueryRunner();
      await cancelRunner.connect();
      await cancelRunner.query('SELECT pg_cancel_backend($1)', [backendPid]);
      await cancelRunner.release();
    } catch {
      // best-effort; ignore if the backend already finished
    }
  };

  if (req.method === 'GET') {
    req.customData = req.customData || { entityManager: queryRunner.manager };

    res.on('close', async () => {
      if (!res.writableEnded) await cancelBackend();
      await queryRunner.release();
    });

    return next();
  }

  await queryRunner.startTransaction();

  req.customData = req.customData || { entityManager: queryRunner.manager };

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
