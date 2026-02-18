import React from 'react';
import { renderHook, act, waitFor, screen, fireEvent } from '@testing-library/react';
import useNotifications from 'hooks/useNotifications';
import { NotificationProvider } from '../../src/contexts/NotificationsContext';

describe('useNotifications', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => <NotificationProvider>{children}</NotificationProvider>;

  it('throws if used outside NotificationProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNotifications())).toThrow('useNotifications must be used within a NotificationContext');
    spy.mockRestore();
  });

  it('returns context when used within provider', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(result.current).toHaveProperty('notifications');
    expect(result.current).toHaveProperty('showNotification');
    expect(result.current).toHaveProperty('removeNotification');
    expect(Array.isArray(result.current.notifications)).toBe(true);
  });

  it('adds notifications (newest on top) and enforces max 3 visible', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.showNotification({ id: 'a', title: 'A' });
      result.current.showNotification({ id: 'b', title: 'B' });
      result.current.showNotification({ id: 'c', title: 'C' });
    });

    expect(result.current.notifications.map(n => n.id)).toEqual(['c', 'b', 'a']);

    act(() => {
      result.current.showNotification({ id: 'd', title: 'D' });
      result.current.showNotification({ id: 'e', title: 'E' });
    });

    expect(result.current.notifications.map(n => n.id)).toEqual(['c', 'b', 'a']);
  });

  it('promotes from queue when a visible notification is removed', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.showNotification({ id: 'a', title: 'A' });
      result.current.showNotification({ id: 'b', title: 'B' });
      result.current.showNotification({ id: 'c', title: 'C' });

      result.current.showNotification({ id: 'd', title: 'D' });
      result.current.showNotification({ id: 'e', title: 'E' });
    });

    expect(result.current.notifications.map(n => n.id)).toEqual(['c', 'b', 'a']);

    act(() => {
      result.current.removeNotification('b');
    });

    await waitFor(() => {
      expect(result.current.notifications.map(n => n.id)).toEqual(['d', 'c', 'a']);
    });

    act(() => {
      result.current.removeNotification('a');
    });

    await waitFor(() => {
      expect(result.current.notifications.map(n => n.id)).toEqual(['e', 'd', 'c']);
    });
  });

  it('auto-dismisses after 4000ms', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.showNotification({ id: 'a', title: 'A' });
    });

    expect(result.current.notifications.map(n => n.id)).toEqual(['a']);

    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(result.current.notifications.map(n => n.id)).toEqual(['a']);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.notifications).toEqual([]);
  });

  it('ignores duplicates (same id)', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.showNotification({ id: 'a', title: 'A' });
      result.current.showNotification({ id: 'a', title: 'A' });
      result.current.showNotification({ id: 'a', title: 'A' });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('A');
  });

  it('ignores duplicates (same id) in que', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.showNotification({ id: 'a', title: 'A' });
      result.current.showNotification({ id: 'b', title: 'B' });
      result.current.showNotification({ id: 'c', title: 'C' });

      result.current.showNotification({ id: 'd', title: 'D' });
      result.current.showNotification({ id: 'd', title: 'D' });
    });

    expect(result.current.notifications.map(n => n.id)).toEqual(['c', 'b', 'a']);

    act(() => {
      result.current.removeNotification('b');
    });

    await waitFor(() => {
      expect(result.current.notifications.map(n => n.id)).toEqual(['d', 'c', 'a']);
    });

    act(() => {
      result.current.removeNotification('a');
    });

    await waitFor(() => {
      expect(result.current.notifications.map(n => n.id)).toEqual(['d', 'c']);
    });
  });

  it('dismisses notifications on the notification close icon click', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      result.current.showNotification({ id: 'a', title: 'A' });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(screen.getByTestId('sh-ui-notification')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId('sh-ui-notification-close'));
    });

    expect(screen.queryByTestId('sh-ui-notification')).not.toBeInTheDocument();
    expect(result.current.notifications).toHaveLength(0);
  });
});
