import { useSyncExternalStore } from 'react';

import { MOBILE_BREAKPOINT, PHONE_MAX_SHORT_SIDE, TABLET_BREAKPOINT } from '../configuration/layout';

type useDeviceType = {
  isDesktopLayout: boolean;
  isMobileLayout: boolean;
  isTabletLayout: boolean;
  isTouchScreen: boolean;
  isMobileDevice: boolean;
};

type MediaQueryStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
  getServerSnapshot: () => boolean;
};

// Read live from the browser on every render and shared by every caller, so components mounted at different
// moments always agree, and a change made before a component subscribes is not lost.
const createMediaQueryStore = (query: string): MediaQueryStore => ({
  subscribe: onChange => {
    const mediaQueryList = window.matchMedia(query);
    mediaQueryList.addEventListener('change', onChange);
    return () => mediaQueryList.removeEventListener('change', onChange);
  },
  getSnapshot: () => window.matchMedia(query).matches,
  // No window on the server: render the desktop layout
  getServerSnapshot: () => false,
});

// Same queries as the SCSS breakpoints, so JS and CSS switch layout together
const mobileLayoutStore = createMediaQueryStore(`(max-width: ${MOBILE_BREAKPOINT}px)`);
const tabletOrSmallerLayoutStore = createMediaQueryStore(`(max-width: ${TABLET_BREAKPOINT}px)`);
// A finger is the primary input: phones and tablets, not laptops (touchscreen ones report their trackpad)
const touchScreenStore = createMediaQueryStore('(pointer: coarse)');

const useMediaQuery = ({ subscribe, getSnapshot, getServerSnapshot }: MediaQueryStore) =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

// The device's screen rather than the window, so window size and zoom don't change it;
// the short side keeps a phone held in landscape a phone
const hasPhoneSizedScreen = () => Math.min(window.screen.width, window.screen.height) < PHONE_MAX_SHORT_SIDE;

const useDevice = (): useDeviceType => {
  const isMobileLayout = useMediaQuery(mobileLayoutStore);
  const isTabletOrSmallerLayout = useMediaQuery(tabletOrSmallerLayoutStore);
  const isTouchScreen = useMediaQuery(touchScreenStore);

  const isTabletLayout = !isMobileLayout && isTabletOrSmallerLayout;
  const isDesktopLayout = !isTabletOrSmallerLayout;
  // Layout follows the window width; what a phone can't do (download, draw or upload polygons) follows this
  const isMobileDevice = isTouchScreen && hasPhoneSizedScreen();

  return { isDesktopLayout, isMobileLayout, isTabletLayout, isTouchScreen, isMobileDevice };
};

export default useDevice;
