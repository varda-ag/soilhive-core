import React, { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { loadRemotes, partitionDuplicatePluginIds } from '../utilities/moduleFederation';
import type { Plugin, RemotePlugin } from '../types/plugins';
import useTheme from '../hooks/useTheme';
import useNotifications from '../hooks/useNotifications';

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
  const { showNotification } = useNotifications();
  const { t } = useTranslation('common');

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
        const { unique, duplicates } = partitionDuplicatePluginIds(loaded);
        // Report duplicates via a notification, rather than throwing, so a single
        // misconfigured plugin doesn't take down the rest of the app.
        duplicates.forEach(duplicate => {
          showNotification({
            id: `duplicate-plugin-id-${duplicate.pluginId}`,
            title: t('plugins.duplicate_id.title'),
            message: t('plugins.duplicate_id.message', {
              name: duplicate.name,
              pluginId: duplicate.pluginId,
            }),
            type: 'error',
          });
        });
        if (!cancelled) setPlugins(unique);
      } finally {
        if (!cancelled) setIsLoadingModules(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [themeConfig?.plugins, isLoadingThemeConfig, showNotification, t]);

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
