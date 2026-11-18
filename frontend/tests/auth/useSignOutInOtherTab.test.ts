// useSignOutInOtherTab.test.ts
import { renderHook } from '@testing-library/react';
import { useSignOutInOtherTab } from '../../src/auth/useSignOutInOtherTab';

const isOidcUserKey = (key: string) => key.startsWith('oidc.user:');

const fireStorage = (init: StorageEventInit) => {
  window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, ...init }));
};

describe('useSignOutInOtherTab', () => {
  it('calls onSignedOut when another tab removes a sign-out key', () => {
    const onSignedOut = jest.fn();
    renderHook(() => useSignOutInOtherTab(isOidcUserKey, onSignedOut));

    fireStorage({ key: 'oidc.user:https://idp:client', newValue: null });

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('ignores the removal of a key that is not a sign-out key', () => {
    const onSignedOut = jest.fn();
    renderHook(() => useSignOutInOtherTab(isOidcUserKey, onSignedOut));

    fireStorage({ key: 'token', newValue: null });

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('ignores a sign-out key that another tab sets to a new value (renew)', () => {
    const onSignedOut = jest.fn();
    renderHook(() => useSignOutInOtherTab(isOidcUserKey, onSignedOut));

    fireStorage({ key: 'oidc.user:https://idp:client', oldValue: '{}', newValue: '{"a":1}' });

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('treats a cleared localStorage as a sign-out', () => {
    const onSignedOut = jest.fn();
    renderHook(() => useSignOutInOtherTab(isOidcUserKey, onSignedOut));

    fireStorage({ key: null, newValue: null });

    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it('ignores changes in sessionStorage', () => {
    const onSignedOut = jest.fn();
    renderHook(() => useSignOutInOtherTab(isOidcUserKey, onSignedOut));

    fireStorage({ key: 'oidc.user:https://idp:client', newValue: null, storageArea: sessionStorage });

    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const onSignedOut = jest.fn();
    const { unmount } = renderHook(() => useSignOutInOtherTab(isOidcUserKey, onSignedOut));

    unmount();
    fireStorage({ key: 'oidc.user:https://idp:client', newValue: null });

    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
