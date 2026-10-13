import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { act, renderHook } from '@testing-library/react';
import useDevice from 'hooks/useDevice';

type Viewport = { width: number; pointer: 'fine' | 'coarse' };

const viewport: Viewport = { width: 1440, pointer: 'fine' };
const changeListeners = new Set<() => void>();
let widthOnFirstSubscribe: number | undefined;

const matchesViewport = (query: string) => {
  const maxWidth = /^\(max-width: (\d+)px\)$/.exec(query);
  if (maxWidth) return viewport.width <= Number(maxWidth[1]);
  if (query === '(pointer: coarse)') return viewport.pointer === 'coarse';
  throw new Error(`Unexpected media query: ${query}`);
};

const fakeMatchMedia = (query: string) =>
  ({
    media: query,
    get matches() {
      return matchesViewport(query);
    },
    addEventListener: (_type: 'change', listener: () => void) => {
      if (widthOnFirstSubscribe !== undefined) {
        viewport.width = widthOnFirstSubscribe;
        widthOnFirstSubscribe = undefined;
      }
      changeListeners.add(listener);
    },
    removeEventListener: (_type: 'change', listener: () => void) => {
      changeListeners.delete(listener);
    },
  }) as unknown as MediaQueryList;

const resizeWindow = (width: number) =>
  act(() => {
    viewport.width = width;
    [...changeListeners].forEach(listener => listener());
  });

const setScreen = (width: number, height: number) => {
  jest.spyOn(window.screen, 'width', 'get').mockReturnValue(width);
  jest.spyOn(window.screen, 'height', 'get').mockReturnValue(height);
};

describe('useDevice hook', () => {
  beforeEach(() => {
    viewport.width = 1440;
    viewport.pointer = 'fine';
    changeListeners.clear();
    widthOnFirstSubscribe = undefined;
    window.matchMedia = jest.fn(fakeMatchMedia);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('layout', () => {
    it('returns true for isMobileLayout if the width of the browser is equal to or lower than the mobile breakpoint', () => {
      viewport.width = 767;

      const { result } = renderHook(() => useDevice());
      expect(result.current).toMatchObject({ isMobileLayout: true, isTabletLayout: false, isDesktopLayout: false });
    });

    it('returns true for isTabletLayout if the width of the browser is greater than the mobile breakpoint', () => {
      viewport.width = 768;

      const { result } = renderHook(() => useDevice());
      expect(result.current).toMatchObject({ isMobileLayout: false, isTabletLayout: true, isDesktopLayout: false });
    });

    it('returns true for isTabletLayout if the width of the browser is equal to the tablet breakpoint', () => {
      viewport.width = 1023;

      const { result } = renderHook(() => useDevice());
      expect(result.current).toMatchObject({ isMobileLayout: false, isTabletLayout: true, isDesktopLayout: false });
    });

    it('returns true for isDesktopLayout if the width of the browser is greater than the tablet breakpoint', () => {
      viewport.width = 1024;

      const { result } = renderHook(() => useDevice());
      expect(result.current).toMatchObject({ isMobileLayout: false, isTabletLayout: false, isDesktopLayout: true });
    });

    it('switches from the mobile to the desktop layout when the browser is resized', () => {
      viewport.width = 700;
      const { result } = renderHook(() => useDevice());
      expect(result.current.isMobileLayout).toBe(true);

      resizeWindow(1440);

      expect(result.current).toMatchObject({ isMobileLayout: false, isDesktopLayout: true });
    });

    it('picks up a resize that happens between the first render and listening for changes', () => {
      viewport.width = 700;
      // No change event: the hook is not listening yet when the width changes
      widthOnFirstSubscribe = 1440;

      const { result } = renderHook(() => useDevice());

      expect(result.current).toMatchObject({ isMobileLayout: false, isDesktopLayout: true });
    });

    it('returns the same layout to components mounted at different widths of the browser', () => {
      viewport.width = 700;
      const first = renderHook(() => useDevice());
      viewport.width = 1440;
      const second = renderHook(() => useDevice());

      resizeWindow(1440);

      expect(first.result.current).toEqual(second.result.current);
      expect(first.result.current.isDesktopLayout).toBe(true);
    });
  });

  describe('device', () => {
    it('returns true for isTouchScreen if the device has touch screen as primary input device', () => {
      viewport.pointer = 'coarse';

      const { result } = renderHook(() => useDevice());
      expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
      expect(result.current.isTouchScreen).toBe(true);
    });

    it('returns false for isTouchScreen if the device does not have touch screen as primary input device', () => {
      viewport.pointer = 'fine';

      const { result } = renderHook(() => useDevice());
      expect(window.matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
      expect(result.current.isTouchScreen).toBe(false);
    });

    it('returns true for isMobileDevice on a phone', () => {
      viewport.pointer = 'coarse';
      setScreen(390, 844);

      const { result } = renderHook(() => useDevice());
      expect(result.current.isMobileDevice).toBe(true);
    });

    it('returns true for isMobileDevice on a phone held in landscape', () => {
      viewport.pointer = 'coarse';
      setScreen(844, 390);

      const { result } = renderHook(() => useDevice());
      expect(result.current.isMobileDevice).toBe(true);
    });

    it('returns false for isMobileDevice on an iPad', () => {
      viewport.pointer = 'coarse';
      setScreen(834, 1194);

      const { result } = renderHook(() => useDevice());
      expect(result.current.isMobileDevice).toBe(false);
    });

    it('returns false for isMobileDevice on a laptop with the browser narrower than the mobile breakpoint', () => {
      viewport.width = 700;
      viewport.pointer = 'fine';
      setScreen(1440, 900);

      const { result } = renderHook(() => useDevice());
      expect(result.current).toMatchObject({ isMobileLayout: true, isMobileDevice: false });
    });
  });

  describe('server-side rendering', () => {
    const TrueFlags = () =>
      Object.entries(useDevice())
        .filter(([, value]) => value)
        .map(([flag]) => flag)
        .join(' ');

    it('renders the desktop layout without reading the browser', () => {
      const html = renderToString(createElement(TrueFlags));

      expect(html).toBe('isDesktopLayout');
      expect(window.matchMedia).not.toHaveBeenCalled();
    });
  });
});
