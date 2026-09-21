import { Response } from 'express';
import { EntityManager } from 'typeorm';

/**
 * Builds a plain AbortSignal tied to the response's socket closing - usable for any work that
 * should stop once the client disconnects. `transactionMiddleware` wires one into `requestData.signal`
 * for every request.
 */
export const withDisconnectSignal = (res: Response): AbortSignal => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller.signal;
};

/**
 * Runs `run` in its own transaction on a connection borrowed from `entityManager`, and
 * cancels that connection's backend if `signal` aborts before `run` resolves. Mirrors
 * `transactionMiddleware`'s `cancelBackend()`: the cancel itself runs on a second,
 * separate connection, since the borrowed one is busy executing the query it targets.
 *
 * Use this whenever a query runs on a connection independent of the request's own
 * transactional entityManager - e.g. several queries borrowed from the pool's default
 * manager to run genuinely concurrently instead of serializing on one connection - and
 * still needs client-disconnect cancellation like the request-wide transaction gets for
 * free from `transactionMiddleware`. `run` receives the transactional entityManager, so
 * callers needing session-scoped settings (e.g. `SET LOCAL work_mem`) can issue them as
 * the first statement inside it - `SET LOCAL` only holds for statements that follow it
 * within the same explicit transaction and connection.
 */
export const runCancelableQuery = async <T>(
  entityManager: EntityManager,
  signal: AbortSignal | undefined,
  run: (transactionalEntityManager: EntityManager) => Promise<T>,
): Promise<T> => {
  return entityManager.transaction(async transactionalEntityManager => {
    if (!signal) {
      return run(transactionalEntityManager);
    }

    const [{ pid }] = await transactionalEntityManager.query('SELECT pg_backend_pid() AS pid');
    const cancelBackend = async () => {
      const cancelRunner = entityManager.connection.createQueryRunner();
      try {
        await cancelRunner.connect();
        await cancelRunner.query('SELECT pg_cancel_backend($1)', [pid]);
      } catch {
        // best-effort; ignore if the backend already finished
      } finally {
        await cancelRunner.release().catch(() => {});
      }
    };

    if (signal.aborted) {
      // The signal fired before `run` ever started - there's no in-flight query on `pid` for
      // `cancelBackend` to interrupt (calling it here would be a silent no-op on an idle
      // connection), so reject directly instead of letting `run` execute uncancelled.
      throw new Error('Query aborted before it started');
    }
    signal.addEventListener('abort', cancelBackend, { once: true });
    try {
      return await run(transactionalEntityManager);
    } finally {
      signal.removeEventListener('abort', cancelBackend);
    }
  });
};
