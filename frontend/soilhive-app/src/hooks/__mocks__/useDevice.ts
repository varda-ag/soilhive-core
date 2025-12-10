const defaultIsDesktopLayout = false
const defaultIsMobileLayout = false
const defaultIsTouchScreen = false
const defaultIsTabletLayout = false

export let __isDesktopLayout = defaultIsDesktopLayout
export let __isMobileLayout = defaultIsMobileLayout
export let __isTabletLayout = defaultIsTabletLayout
export let __isTouchScreen = defaultIsTouchScreen

export const __setIsMobileLayout = (isMobileLayout: boolean) => {
    __isMobileLayout = isMobileLayout
}

export const __setIsTabletLayout = (isTabletLayout: boolean) => {
    __isTabletLayout = isTabletLayout
}

export const __setIsDesktopLayout = (isDesktopLayout: boolean) => {
    __isDesktopLayout = isDesktopLayout
}

export const __setIsTouchScreen = (isTouchScreen: boolean) => {
    __isTouchScreen = isTouchScreen
}

export const __resetIsMobileLayout = () => {
    __isMobileLayout = defaultIsMobileLayout
}

export const __resetIsTabletLayout = () => {
    __isTabletLayout = defaultIsTabletLayout
}

export const __resetIsDesktopLayout = () => {
    __isDesktopLayout = defaultIsDesktopLayout
}

export const __resetIsTouchScreen = () => {
    __isTouchScreen = defaultIsTouchScreen
}

const useDevice = () => {
    return {
        isMobileLayout: __isMobileLayout,
        isTabletLayout: __isTabletLayout,
        isTouchScreen: __isTouchScreen,
        isDesktopLayout: __isDesktopLayout,
    }
}

export default useDevice
