import { describe, it, expect, jest } from '@jest/globals';
import { errorMiddleware } from '../../src/middlewares/error';
import { ErrorResponse } from '../../src/utils/error';

const problemBody = async (err: unknown): Promise<Record<string, unknown>> => {
  const json = jest.fn();
  const res: any = {};
  res.status = jest.fn(() => res);
  res.type = jest.fn(() => res);
  res.json = json;
  await errorMiddleware(err, { originalUrl: '/configs/x' } as any, res, () => undefined);
  return json.mock.calls[0]![0] as Record<string, unknown>;
};

describe('errorMiddleware', () => {
  it('adds the extension members of the error to the problem body', async () => {
    const body = await problemBody(new ErrorResponse('No access', 403, { datasets: ['a'] }));
    expect(body).toMatchObject({ title: 'Forbidden', status: 403, detail: 'No access', datasets: ['a'] });
  });

  it('keeps the problem body unchanged when the error has no extensions', async () => {
    const body = await problemBody(new ErrorResponse('No access', 403));
    expect(Object.keys(body).sort()).toEqual(['detail', 'errors', 'instance', 'status', 'title']);
  });

  it('does not let an extension member replace a standard member', async () => {
    const body = await problemBody(new ErrorResponse('No access', 403, { status: 200, title: 'x' }));
    expect(body).toMatchObject({ status: 403, title: 'Forbidden' });
  });
});
