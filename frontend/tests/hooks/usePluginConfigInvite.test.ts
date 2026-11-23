import { renderHook } from '@testing-library/react';
import { usePluginConfigInviteCreate } from 'hooks/usePluginConfigInvite';
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
  id: 'invite-1',
  token: 'secret-token',
  expires_at: '2026-11-25T10:00:00.000Z',
  grants: { configs: { 'plugin:acme:dashboards:abc': ['read'] } },
  recipient: null,
  reusable: false,
  status: 'pending',
  created_by: 'jane@example.com',
  created_at: '2026-11-18T10:00:00.000Z',
  redemptions: [],
};

describe('usePluginConfigInviteCreate', () => {
  beforeEach(() => {
    request.mockResolvedValue(created);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('asks for an Invite to the namespaced item, with the options it was given', async () => {
    const { result } = renderHook(() => usePluginConfigInviteCreate('acme', 'dashboards:abc'));

    await result.current.mutateAsync({ capabilities: ['read', 'write'], reusable: false, expiresInDays: 7 });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/invites',
        method: 'POST',
        body: { grants: { configs: { 'plugin:acme:dashboards:abc': ['read', 'write'] } }, reusable: false, expires_in_days: 7 },
      }),
    );
  });

  it('leaves out the options it was not given, so the backend defaults apply', async () => {
    const { result } = renderHook(() => usePluginConfigInviteCreate('acme', 'dashboards:abc'));

    await result.current.mutateAsync({ capabilities: ['read'] });

    expect(request.mock.calls[0][0].body).toEqual({ grants: { configs: { 'plugin:acme:dashboards:abc': ['read'] } } });
  });

  it('sends a recipient as it is', async () => {
    const { result } = renderHook(() => usePluginConfigInviteCreate('acme', 'dashboards:abc'));

    await result.current.mutateAsync({ capabilities: ['read'], recipient: 'joe@example.com' });

    expect(request.mock.calls[0][0].body).toMatchObject({ recipient: 'joe@example.com' });
  });

  it('gives back only the id, the token and the expiry, in plugin shape', async () => {
    const { result } = renderHook(() => usePluginConfigInviteCreate('acme', 'dashboards:abc'));

    await expect(result.current.mutateAsync({ capabilities: ['read'] })).resolves.toEqual({
      id: 'invite-1',
      token: 'secret-token',
      expiresAt: '2026-11-25T10:00:00.000Z',
    });
  });

  it("namespaces different plugins separately, so a plugin cannot invite to another one's item", async () => {
    const { result } = renderHook(() => usePluginConfigInviteCreate('other', 'dashboards:abc'));

    await result.current.mutateAsync({ capabilities: ['read'] });

    expect(request.mock.calls[0][0].body.grants).toEqual({ configs: { 'plugin:other:dashboards:abc': ['read'] } });
  });

  it('rejects when the backend refuses', async () => {
    request.mockRejectedValue(Object.assign(new Error('HTTP 403'), { status: 403 }));
    const { result } = renderHook(() => usePluginConfigInviteCreate('acme', 'dashboards:abc'));

    await expect(result.current.mutateAsync({ capabilities: ['read'] })).rejects.toMatchObject({ status: 403 });
  });
});
