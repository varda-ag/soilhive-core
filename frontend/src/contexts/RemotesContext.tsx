import React, { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isNewTabModule, loadRemotes, partitionDuplicatePluginIds, partitionInvalidPlugins } from '../utilities/moduleFederation';
import type { Plugin, RemotePlugin } from '../types/plugins';
import useTheme from '../hooks/useTheme';
import useNotifications from '../hooks/useNotifications';
import { useAuthContext } from '../auth/AuthContextProvider';
import { AuthModes } from '../auth/types';

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
  const { authMode } = useAuthContext();
  const { t } = useTranslation('common');

  const [plugins, setPlugins] = useState<RemotePlugin[]>([]);
  const [isLoadingModules, setIsLoadingModules] = useState(true);

  // Guards against re-loading the same config (e.g. React Strict Mode double-invoke
  // or unrelated re-renders). The MF host is a singleton, so remotes load once.
  // So that one load is never cancelled on cleanup: Strict Mode's simulated
  // unmount would discard it and leave the app blank whenever the provider mounts
  // with the theme config already cached.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (isLoadingThemeConfig || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const load = async () => {
      try {
        const { loaded, failed } = await loadRemotes(themeConfig.plugins ?? EMPTY_REMOTES);

        // Report remotes that couldn't be loaded at all (e.g. unreachable
        // server/url) separately from the missing-fields notification below:
        // a remote that never loaded has no pluginId/name to report as missing.
        failed.forEach(url => {
          showNotification({
            id: `remote-load-failed-${url}`,
            title: t('plugins.load_failed.title'),
            message: t('plugins.load_failed.message', { url }),
            type: 'error',
          });
        });

        const { valid, invalid } = partitionInvalidPlugins(loaded);
        // Report modules missing required exports via a notification, rather than
        // throwing, so a single misconfigured plugin doesn't take down the rest of
        // the app. Runs before dedup below, since that keys a Set on pluginId and
        // a missing pluginId would corrupt it.
        invalid.forEach(({ module, missingFields }) => {
          const identifier = module.name || module.pluginId || t('plugins.invalid_module.unknown_plugin');
          showNotification({
            id: `invalid-plugin-${identifier}`,
            title: t('plugins.invalid_module.title'),
            message: t('plugins.invalid_module.message', {
              identifier,
              missingFields: missingFields.join(', '),
            }),
            type: 'error',
          });
        });

        const { unique, duplicates } = partitionDuplicatePluginIds(valid);
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
        // Nobody can sign in without an identity system, so a plugin that needs
        // a signed-in user is not installed at all there, route included. A
        // new-tab plugin is kept: its page is not the host's to gate.
        // authMode is fixed for the page's lifetime, so this never changes.
        const available = authMode === AuthModes.NONE ? unique.filter(plugin => !plugin.requiresAuth || isNewTabModule(plugin)) : unique;
        setPlugins(available);
      } finally {
        setIsLoadingModules(false);
      }
    };
    load();
  }, [themeConfig?.plugins, isLoadingThemeConfig, authMode, showNotification, t]);

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
