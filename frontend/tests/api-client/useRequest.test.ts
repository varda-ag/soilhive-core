// useRequest.test.ts
import { act, renderHook } from '@testing-library/react';
import { useRequest } from '../../src/api-client/useRequest';
import { httpClient } from '../../src/api-client/httpClient';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/api-client/httpClient', () => ({
  httpClient: jest.fn(),
}));

const showNotification = jest.fn();
jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: () => ({ showNotification }),
}));

// Stable t, so the request callback keeps its identity across renders.
const t = (key: string) => key;
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const failWith = (error: object) => (httpClient as jest.Mock).mockRejectedValue(error);

const runRequest = async (config: object = {}) => {
  const { result } = renderHook(() => useRequest());
  await act(async () => {
    await result.current.request({ url: '/datasets', ...config }).catch(() => undefined);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRequest error notification', () => {
  it('shows "login required" instead of the raw backend text on a 401', async () => {
    failWith({ status: 401, message: 'Authorization header required' });

    await runRequest();

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith({
      id: 'unauthorized',
      type: 'error',
      title: 'errors.unauthorized.title',
      message: 'errors.unauthorized.message',
    });
  });

  // The session may still be alive, so "log in again" would be the wrong advice.
  it('shows a network error when the 401 could not be fixed because the login server was unreachable', async () => {
    failWith({ status: 401, message: 'expired', loginServerUnavailable: true });

    await runRequest();

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith({
      id: 'network_error',
      type: 'error',
      title: 'errors.network_error.title',
      message: 'errors.network_error.login_server_message',
    });
  });

  it('shows no notification for a 401 when the caller turned notifications off', async () => {
    failWith({ status: 401, message: 'Authorization header required' });

    await runRequest({ showErrorNotification: false });

    expect(showNotification).not.toHaveBeenCalled();
  });

  it('still shows the raw backend text for a 500', async () => {
    failWith({ status: 500, message: 'Database unavailable' });

    await runRequest();

    expect(showNotification).toHaveBeenCalledWith({
      id: 'network_error',
      type: 'error',
      title: 'errors.network_error.title',
      message: 'Database unavailable',
    });
  });
});
