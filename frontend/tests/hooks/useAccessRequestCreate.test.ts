import { renderHook } from '@testing-library/react';
import { useAccessRequestCreate } from 'hooks/useAccessRequestCreate';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({ BACKEND_BASE_URL: 'https://api.example.com' }));

// Runs mutationFn directly, so the test reads the request it makes.
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(({ mutationFn }: { mutationFn: unknown }) => ({ mutateAsync: mutationFn, isPending: false, isError: false })),
}));

const request = jest.fn();
(useRequest as jest.Mock).mockReturnValue({ request });

const created = {
  id: 'request-1',
  requested_by: 'jane@example.com',
  capabilities: ['preview'],
  message: 'A soil project',
  status: 'pending',
  created_at: '2026-11-24T10:00:00.000Z',
  items: [],
};

describe('useAccessRequestCreate', () => {
  beforeEach(() => {
    request.mockResolvedValue(created);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('asks for access to the Datasets, with the message', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync({ datasets: ['ds-a', 'ds-b'], capabilities: ['preview'], message: 'A soil project' });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/access-requests',
        method: 'POST',
        body: { datasets: ['ds-a', 'ds-b'], capabilities: ['preview'], message: 'A soil project' },
      }),
    );
  });

  it('leaves out a message it was not given', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync({ datasets: ['ds-a'], capabilities: ['preview', 'download'] });

    expect(request.mock.calls[0][0].body).toEqual({ datasets: ['ds-a'], capabilities: ['preview', 'download'] });
  });

  it('lets the host toast a refusal', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync({ datasets: ['ds-a'], capabilities: ['preview'] });

    expect(request.mock.calls[0][0].showErrorNotification).not.toBe(false);
  });

  it('gives the plugin only the id, the status and the creation time', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await expect(result.current.mutateAsync({ datasets: ['ds-a'], capabilities: ['preview'] })).resolves.toEqual({
      id: 'request-1',
      status: 'pending',
      createdAt: '2026-11-24T10:00:00.000Z',
    });
  });

  it('rejects with the error of a refused request', async () => {
    const refusal = { status: 409, message: "You already asked for access to 'Ds A'" };
    request.mockRejectedValue(refusal);
    const { result } = renderHook(() => useAccessRequestCreate());

    await expect(result.current.mutateAsync({ datasets: ['ds-a'], capabilities: ['preview'] })).rejects.toBe(refusal);
  });
});
