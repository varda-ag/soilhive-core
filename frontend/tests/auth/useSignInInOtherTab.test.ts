// useSignInInOtherTab.test.ts
import { renderHook } from '@testing-library/react';
import { useSignInInOtherTab } from '../../src/auth/useSignInInOtherTab';

const isOidcUserKey = (key: string) => key.startsWith('oidc.user:');

const fireStorage = (init: StorageEventInit) => {
  window.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, ...init }));
};

describe('useSignInInOtherTab', () => {
  it('calls onSignedIn when another tab writes a sign-in key', () => {
    const onSignedIn = jest.fn();
    renderHook(() => useSignInInOtherTab(isOidcUserKey, onSignedIn));

    fireStorage({ key: 'oidc.user:https://idp:client', newValue: '{"access_token":"t"}' });

    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('ignores the removal of a sign-in key (sign-out)', () => {
    const onSignedIn = jest.fn();
    renderHook(() => useSignInInOtherTab(isOidcUserKey, onSignedIn));

    fireStorage({ key: 'oidc.user:https://idp:client', newValue: null });

    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('ignores other keys and localStorage.clear()', () => {
    const onSignedIn = jest.fn();
    renderHook(() => useSignInInOtherTab(isOidcUserKey, onSignedIn));

    fireStorage({ key: 'token', newValue: 't' });
    fireStorage({ key: null, newValue: null });

    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const onSignedIn = jest.fn();
    const { unmount } = renderHook(() => useSignInInOtherTab(isOidcUserKey, onSignedIn));
    unmount();

    fireStorage({ key: 'oidc.user:https://idp:client', newValue: '{}' });

    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
