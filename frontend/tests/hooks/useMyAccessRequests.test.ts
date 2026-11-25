import { renderHook } from '@testing-library/react';
import { useMyAccessRequests } from 'hooks/useMyAccessRequests';
import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));

const refetch = jest.fn();
const mine = [
  {
    id: 'request-1',
    requested_by: 'jane@example.com',
    capabilities: ['preview'],
    message: 'A soil project',
    status: 'pending',
    created_at: '2026-11-24T10:00:00.000Z',
    items: [
      { dataset: { slug: 'ds-a', name: 'Ds A' }, status: 'pending', granted: null, reason: null, decided_at: null },
      { dataset: { slug: 'ds-b', name: 'Ds B' }, status: 'denied', granted: null, reason: 'No', decided_at: '2026-11-24T11:00:00.000Z' },
    ],
  },
];

describe('useMyAccessRequests', () => {
  beforeEach(() => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: mine, isLoading: false, isFetchedAfterMount: true, isError: false, refetch });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("reads the user's own requests, without a toast for a failed read", () => {
    renderHook(() => useMyAccessRequests());

    expect(useApiQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/access-requests/mine',
        method: 'GET',
        queryKey: ['access-requests', 'mine'],
        enabled: true,
        showErrorNotification: false,
        disableCache: true,
      }),
    );
  });

  it('is loading while a list cached from before is read again', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: mine, isLoading: false, isFetchedAfterMount: false, isError: false, refetch });

    const { result } = renderHook(() => useMyAccessRequests());

    expect(result.current.isLoading).toBe(true);
  });

  it('is loading on the first read', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true, isFetchedAfterMount: false, isError: false, refetch });

    expect(renderHook(() => useMyAccessRequests()).result.current.isLoading).toBe(true);
  });

  it('is not loading while it refetches after that, e.g. once a request is sent', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: mine, isLoading: false, isFetchedAfterMount: true, isError: false, refetch });

    expect(renderHook(() => useMyAccessRequests()).result.current.isLoading).toBe(false);
  });

  it('gives the plugin each request with the slug, the name and the status of its Datasets', () => {
    const { result } = renderHook(() => useMyAccessRequests());

    expect(result.current).toEqual({
      data: [
        {
          id: 'request-1',
          status: 'pending',
          createdAt: '2026-11-24T10:00:00.000Z',
          items: [
            { dataset: { slug: 'ds-a', name: 'Ds A' }, status: 'pending' },
            { dataset: { slug: 'ds-b', name: 'Ds B' }, status: 'denied' },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      refetch,
    });
  });

  it('has no data while loading or after a failed read', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isFetchedAfterMount: true, isError: true, refetch });

    const { result } = renderHook(() => useMyAccessRequests());

    expect(result.current.data).toBeUndefined();
    expect(result.current.isError).toBe(true);
  });
});
