import { useMemo } from 'react'
import { useWindowSize } from 'react-use'

import { MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from '../configuration/layout';

type useDeviceType = {
    isDesktopLayout: boolean,
    isMobileLayout: boolean,
    isTabletLayout: boolean,
    isTouchScreen: boolean,
};

const useDevice = (): useDeviceType => {
    const { width } = useWindowSize()
    const isMobileLayout = useMemo(() => width <= MOBILE_BREAKPOINT, [width])
    const isTabletLayout = useMemo(
        () => !isMobileLayout && width <= TABLET_BREAKPOINT,
        [isMobileLayout, width]
    )
    const isDesktopLayout = useMemo(
        () => !isMobileLayout && !isTabletLayout,
        [isMobileLayout, isTabletLayout]
    )
    const isTouchScreen = window.matchMedia('(pointer: coarse)').matches

    return { isDesktopLayout, isMobileLayout, isTabletLayout, isTouchScreen }
}

export default useDevice
