declare module 'hooks/useDevice' {
  /** Internal mock values */
  export const __isDesktopLayout: boolean;
  export const __isMobileLayout: boolean;
  export const __isTabletLayout: boolean;
  export const __isTouchScreen: boolean;

  /** Setters */
  export const __setIsDesktopLayout: (value: boolean) => void;
  export const __setIsMobileLayout: (value: boolean) => void;
  export const __setIsTabletLayout: (value: boolean) => void;
  export const __setIsTouchScreen: (value: boolean) => void;

  /** Resetters */
  export const __resetIsDesktopLayout: () => void;
  export const __resetIsMobileLayout: () => void;
  export const __resetIsTabletLayout: () => void;
  export const __resetIsTouchScreen: () => void;

  /** Default hook */
  export default function useDevice(): {
    isDesktopLayout: boolean;
    isMobileLayout: boolean;
    isTabletLayout: boolean;
    isTouchScreen: boolean;
  };
}
