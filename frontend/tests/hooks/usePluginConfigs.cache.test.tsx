import { renderHook, waitFor } from '@testing-library/react';
import usePluginConfigs from 'hooks/usePluginConfigs';
import { useRequest } from '../../src/api-client';
import { queryClientWrapper } from '../queryClientWrapper';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({
  ...jest.requireActual('../../src/configuration/api'),
  BACKEND_BASE_URL: 'https://api.example.com',
}));

// The backend's GET /configs answer, changed between polls by the tests.
let stored: Record<string, { data: unknown; updated_at: string }> = {};
const request = jest.fn(async () => stored);
(useRequest as jest.Mock).mockReturnValue({ request });

// A real QueryClient: the mocked useConfigs in usePluginConfigs.test.ts cannot show which entries
// React Query keeps between two responses.
describe('usePluginConfigs across polls', () => {
  it('keeps the entry of a config that did not change when another one is saved', async () => {
    stored = {
      'plugin:dashboards:a': { data: { name: 'A' }, updated_at: '2026-10-22T10:00:00.000Z' },
      'plugin:dashboards:b': { data: { name: 'B' }, updated_at: '2026-10-22T10:00:00.000Z' },
    };
    // Polls every 50 ms, like the dashboards list does every few seconds.
    const { result } = renderHook(() => usePluginConfigs<{ name: string }>('dashboards', ['a', 'b'], 50), {
      wrapper: queryClientWrapper,
    });
    await waitFor(() => expect(result.current.data.b).toBeDefined());
    const { a, b } = result.current.data;

    stored = { ...stored, 'plugin:dashboards:b': { data: { name: 'B2' }, updated_at: '2026-10-23T07:59:52.473Z' } };
    await waitFor(() => expect(result.current.data.b).not.toBe(b));

    expect(result.current.data.b).toEqual({ config: { name: 'B2' }, updatedAt: '2026-10-23T07:59:52.473Z' });
    expect(result.current.data.a).toBe(a);
  });
});
