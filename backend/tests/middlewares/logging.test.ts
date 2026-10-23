import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { loggingMiddleware } from '../../src/middlewares/logging';
import { log } from '../../src/utils/logger';

const finish = (req: object): jest.SpiedFunction<typeof log.info> => {
  const info = jest.spyOn(log, 'info').mockImplementation(() => undefined);
  const res = Object.assign(new EventEmitter(), { statusCode: 200 });
  loggingMiddleware(
    { method: 'GET', path: '/datasets', originalUrl: '/datasets', headers: {}, ...req } as any,
    res as any,
    () => undefined,
  );
  res.emit('finish');
  return info;
};

describe('loggingMiddleware', () => {
  it('logs the plugin a Plugin token acts for', () => {
    const info = finish({ customData: { token: { pluginId: 'zones' } } });
    expect(info.mock.calls[0]![1]).toMatchObject({ 'soilhive.plugin_id': 'zones' });
    info.mockRestore();
  });

  it('logs a request that never got customData without throwing', () => {
    const info = finish({});
    expect(info.mock.calls[0]![1]).not.toHaveProperty('soilhive.plugin_id');
    info.mockRestore();
  });
});
