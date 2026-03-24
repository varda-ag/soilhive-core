import { renderHook, act } from '@testing-library/react';
import { useDialogDismiss } from 'hooks/useDialogDismiss';

const STORAGE_KEY = 'test-key';
const FULL_KEY = `info-dialog-dismiss:${STORAGE_KEY}`;

describe('useDialogDismiss', () => {
  beforeEach(() => localStorage.clear());

  it('returns isDismissed false when key is not in localStorage', () => {
    const { result } = renderHook(() => useDialogDismiss(STORAGE_KEY));
    expect(result.current.isDismissed).toBe(false);
  });

  it('returns isDismissed true when key is already in localStorage', () => {
    localStorage.setItem(FULL_KEY, 'true');
    const { result } = renderHook(() => useDialogDismiss(STORAGE_KEY));
    expect(result.current.isDismissed).toBe(true);
  });

  it('sets localStorage and updates isDismissed when dismissPermanently is called', () => {
    const { result } = renderHook(() => useDialogDismiss(STORAGE_KEY));

    act(() => result.current.dismissPermanently());

    expect(localStorage.getItem(FULL_KEY)).toBe('true');
    expect(result.current.isDismissed).toBe(true);
  });
});
