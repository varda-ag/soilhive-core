import { renderHook } from '@testing-library/react';
import { useAccessRequestCreate } from 'hooks/useAccessRequestCreate';
import type { PluginAccessRequestInput } from 'frontend-plugin-types';
import { useRequest } from '../../src/api-client';

jest.mock('../../src/api-client', () => ({ useRequest: jest.fn() }));
jest.mock('../../src/configuration/api', () => ({ BACKEND_BASE_URL: 'https://api.example.com' }));

// Runs mutationFn directly, so the test reads the request it makes.
const invalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useMutation: jest.fn(({ mutationFn }: { mutationFn: unknown }) => ({ mutateAsync: mutationFn, isPending: false, isError: false })),
  useQueryClient: () => ({ invalidateQueries }),
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

const input: PluginAccessRequestInput = {
  datasets: ['ds-a', 'ds-b'],
  capabilities: ['preview'],
  message: 'A soil project',
  requesterName: 'Jane Doe',
  country: 'NL',
  organisation: 'WUR',
  organisationWebsite: 'wur.nl',
};
const { organisationWebsite: _, ...withoutWebsite } = input;

describe('useAccessRequestCreate', () => {
  beforeEach(() => {
    request.mockResolvedValue(created);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('asks for access to the Datasets, with what the requester says about themselves', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync(input);

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/access-requests',
        method: 'POST',
        body: {
          datasets: ['ds-a', 'ds-b'],
          capabilities: ['preview'],
          message: 'A soil project',
          requester_name: 'Jane Doe',
          country: 'NL',
          organisation: 'WUR',
          organisation_website: 'wur.nl',
        },
      }),
    );
  });

  it('leaves out an organisation website it was not given', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync(withoutWebsite);

    expect(request.mock.calls[0][0].body).not.toHaveProperty('organisation_website');
  });

  it('shows no toast for a refusal: the plugin says what went wrong', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync(input);

    expect(request.mock.calls[0][0].showErrorNotification).toBe(false);
  });

  it('gives the plugin only the id, the status and the creation time', async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await expect(result.current.mutateAsync(input)).resolves.toEqual({
      id: 'request-1',
      status: 'pending',
      createdAt: '2026-11-24T10:00:00.000Z',
    });
  });

  it("refetches the user's own requests once one is sent", async () => {
    const { result } = renderHook(() => useAccessRequestCreate());

    await result.current.mutateAsync(input);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['access-requests', 'mine'] });
  });

  it('rejects with the status and the body of a refused request', async () => {
    const body = { detail: "You already asked for access to 'Ds A'", pending_request_id: 'request-0' };
    request.mockRejectedValue({ status: 409, statusText: 'Conflict', message: body.detail, raw: body, retryAfter: null });
    const { result } = renderHook(() => useAccessRequestCreate());

    await expect(result.current.mutateAsync(input)).rejects.toEqual({ status: 409, body });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects with status 0 when there was no response', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAccessRequestCreate());

    await expect(result.current.mutateAsync(input)).rejects.toEqual({
      status: 0,
      body: undefined,
    });
  });
});
