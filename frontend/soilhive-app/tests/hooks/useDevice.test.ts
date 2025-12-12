import { useWindowSize } from 'react-use';
import { renderHook } from '@testing-library/react';
import useDevice from 'hooks/useDevice';

jest.mock('react-use', () => ({
  useWindowSize: jest.fn(),
}));

describe('useDevice hook', () => {
  let matchMediaSpy: jest.SpyInstance;
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: true,
    }));
    matchMediaSpy = jest.spyOn(window, 'matchMedia');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false for isMobileLayout if the width of the browser is greater than the mobile breakpoint', () => {
    (useWindowSize as jest.Mock).mockReturnValue({ width: 768 });

    const { result } = renderHook(() => useDevice());
    expect(result.current.isMobileLayout).toEqual(false);
  });

  it('returns true for isMobileLayout if the width of the browser is equal to or lower than the mobile breakpoint', () => {
    (useWindowSize as jest.Mock).mockReturnValue({ width: 767 });

    const { result } = renderHook(() => useDevice());
    expect(result.current.isMobileLayout).toEqual(true);
  });

  it('returns true for isTouchScreen if the device has touch screen as primary input device', () => {
    const mockMatchMedia = jest.fn().mockReturnValue({ matches: true });
    matchMediaSpy.mockImplementation(mockMatchMedia);

    const { result } = renderHook(() => useDevice());
    expect(mockMatchMedia).toHaveBeenCalledWith('(pointer: coarse)');
    expect(result.current.isTouchScreen).toEqual(true);
  });

  it('returns false for isTouchScreen if the device does not have touch screen as primary input device', () => {
    const mockMatchMedia = jest.fn().mockReturnValue({ matches: false });
    matchMediaSpy.mockImplementation(mockMatchMedia);

    const { result } = renderHook(() => useDevice());
    expect(mockMatchMedia).toHaveBeenCalledWith('(pointer: coarse)');
    expect(result.current.isTouchScreen).toEqual(false);
  });
});
