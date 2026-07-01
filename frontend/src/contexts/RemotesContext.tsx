import React, { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { isSinglePageModule, loadRemotes, type Plugin, type RemoteModule, type SinglePageModule } from '../utilities/moduleFederation';
import useTheme from '../hooks/useTheme';

type RemotesContextType = {
  modules: RemoteModule[];
  singlePages: SinglePageModule[];
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

  const [modules, setModules] = useState<RemoteModule[]>([]);
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
        if (!cancelled) setModules(loaded);
      } finally {
        if (!cancelled) setIsLoadingModules(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [themeConfig?.plugins, isLoadingThemeConfig]);

  const singlePages = modules.filter(isSinglePageModule);

  return (
    <RemotesContext.Provider
      value={{
        modules,
        singlePages,
        isLoadingRemotes: isLoadingThemeConfig || isLoadingModules,
      }}
    >
      {children}
    </RemotesContext.Provider>
  );
};
