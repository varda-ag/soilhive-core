import React from 'react';
import { renderHook, act } from '@testing-library/react';
import useDownloads from 'hooks/useDownloads';
import { DownloadsProvider } from '../../src/contexts/DownloadsContext';

describe('useDownloads', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <DownloadsProvider>{children}</DownloadsProvider>;

  it('throws if used outside DownloadsProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useDownloads())).toThrow('useDownloads must be used within a DownloadsContext');
    spy.mockRestore();
  });

  it('returns context when used within provider', () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    expect(result.current).toHaveProperty('downloads');
    expect(result.current).toHaveProperty('pushDownload');
    expect(result.current).toHaveProperty('cancelDownload');
    expect(Array.isArray(result.current.downloads)).toBe(true);
  });

  it('pushDownload appends a new download', () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    act(() => {
      result.current.pushDownload({ id: '3', progress: 10 });
    });

    expect(result.current.downloads).toEqual([
      { id: '1', progress: 85 },
      { id: '2', progress: 53 },
      { id: '3', progress: 10 },
    ]);
  });

  it('cancelDownload removes download by id', () => {
    const { result } = renderHook(() => useDownloads(), { wrapper });

    act(() => {
      result.current.cancelDownload('1');
    });

    expect(result.current.downloads).toEqual([{ id: '2', progress: 53 }]);
  });
});
