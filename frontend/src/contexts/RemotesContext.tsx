import React, { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadRemotes } from '../utilities/moduleFederation';
import type { Plugin, RemotePlugin } from '../types/plugins';
import useTheme from '../hooks/useTheme';

type RemotesContextType = {
  plugins: RemotePlugin[];
  isLoadingRemotes: boolean;
};

export const RemotesContext = createContext<RemotesContextType | undefined>(undefined);

type RemotesProviderProps = {
  children: ReactNode;
};

// Stable default so useConfig's fallback identity doesn't change between renders.
const EMPTY_REMOTES: Plugin[] = [];

export const RemotesProvider: React.FC<RemotesProviderProps> = ({ children }) => {
  const { themeConfig, isLoadingThemeConfig } = useTheme();

  const [plugins, setPlugins] = useState<RemotePlugin[]>([]);
  const [isLoadingModules, setIsLoadingModules] = useState(true);

  // Guards against re-loading the same config (e.g. React Strict Mode double-invoke
  // or unrelated re-renders). The MF host is a singleton, so remotes load once.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (isLoadingThemeConfig || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let cancelled = false;

    const load = async () => {
      try {
        const loaded = await loadRemotes(themeConfig.plugins ?? EMPTY_REMOTES);
        if (!cancelled) setPlugins(loaded);
      } finally {
        if (!cancelled) setIsLoadingModules(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [themeConfig?.plugins, isLoadingThemeConfig]);

  return (
    <RemotesContext.Provider
      value={{
        plugins,
        isLoadingRemotes: isLoadingThemeConfig || isLoadingModules,
      }}
    >
      {children}
    </RemotesContext.Provider>
  );
};
