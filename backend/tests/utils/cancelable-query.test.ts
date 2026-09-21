import { describe, it, expect, jest } from '@jest/globals';
import { EntityManager } from 'typeorm';
import { getEntityManager } from '../../src/utils/data-source';
import { runCancelableQuery } from '../../src/utils/cancelable-query';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('runCancelableQuery', () => {
  it('runs the query normally when no signal is given', async () => {
    const entityManager = await getEntityManager();
    const [{ answer }] = await runCancelableQuery(entityManager, undefined, tem => tem.query('SELECT 42 AS answer'));
    expect(Number(answer)).toBe(42);
  });

  it('runs the query normally when the signal never aborts', async () => {
    const entityManager = await getEntityManager();
    const controller = new AbortController();
    const [{ answer }] = await runCancelableQuery(entityManager, controller.signal, tem => tem.query('SELECT 42 AS answer'));
    expect(Number(answer)).toBe(42);
  });

  it('cancels the backend query if the signal aborts before it resolves', async () => {
    const entityManager = await getEntityManager();
    const controller = new AbortController();

    // Long enough that a plain timeout/statement_timeout (20s, see data-source.ts) would
    // never be reached first - only the explicit abort below should end this query, and
    // it should do so almost immediately, not after the full 5s.
    const resultPromise = runCancelableQuery(entityManager, controller.signal, tem => tem.query('SELECT pg_sleep(5)'));

    const start = Date.now();
    await sleep(300);
    controller.abort();

    await expect(resultPromise).rejects.toThrow(/canceling statement due to user request/i);
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it('never runs the query if the signal is already aborted beforehand', async () => {
    const entityManager = await getEntityManager();
    const controller = new AbortController();
    controller.abort();

    const start = Date.now();
    const run = jest.fn((tem: EntityManager) => tem.query('SELECT pg_sleep(5)'));
    await expect(runCancelableQuery(entityManager, controller.signal, run)).rejects.toThrow(/aborted before it started/i);

    expect(run).not.toHaveBeenCalled();
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('does not cancel the backend once the query has already resolved', async () => {
    const entityManager = await getEntityManager();
    const controller = new AbortController();

    const [{ answer }] = await runCancelableQuery(entityManager, controller.signal, tem => tem.query('SELECT 42 AS answer'));
    expect(Number(answer)).toBe(42);

    // Aborting after resolution must be a no-op: the listener is removed in `finally`,
    // and there is nothing left on this connection to cancel.
    expect(() => controller.abort()).not.toThrow();
  });
});
