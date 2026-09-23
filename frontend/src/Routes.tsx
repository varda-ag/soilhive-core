import { useMemo } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router';
import PageTitle from './components/PageTitle';
import { ADMIN_ROOT } from './configuration/admin';
import { METADATA_ROUTE, PRIVACY_POLICY_ROUTE, TERMS_OF_USE_ROUTE } from './configuration/routes';
import { AdminPortalGuard } from './guards/AdminPortalGuard';
import useRemotes from './hooks/useRemotes';
import { usePluginContext } from './hooks/usePluginContext';
import useTheme from './hooks/useTheme';
import { MainLayout } from './layouts';
import { AdminPortalModule } from './modules/AdminPortalModule';
import AvailabilityModule from './modules/AvailabilityModule';
import TermsOfUse from './pages/TermsOfUse';
import Metadata from './pages/Metadata';
import PrivacyPolicy from 'pages/PrivacyPolicy';
import type { SinglePagePlugin } from './types/plugins';
import { isSinglePageModule } from './utilities/moduleFederation';
import './utilities/i18n';

import './App.module.scss';

export const queryClient = new QueryClient();

// Reads PluginContext at render time, inside the route tree, instead of the router baking in a
// snapshot captured when `router` was built. `usePluginContext()`'s return value changes identity
// often (e.g. map selection state); if that identity fed the `router` useMemo below, react-router's
// `RouterProvider` would be handed a brand-new router instance on every such change. RouterProvider
// only resyncs its internal state on a router *identity* change, so swapping instances mid-flight —
// most visibly during the cascade of state updates right after the initial loading gate opens —
// leaves route elements (like this one, which renders its own nested <Routes>) briefly rendered
// against a router whose context hasn't caught up, throwing "useRoutes() may be used only in the
// context of a <Router> component".
function PluginPage({ Page }: { Page: SinglePagePlugin['Page'] }) {
  const pluginContext = usePluginContext();
  return <Page context={pluginContext} />;
}

function AppRoutes() {
  const { t } = useTranslation('common');
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  const { plugins, isLoadingRemotes } = useRemotes();
  const pluginRoutes = useMemo(() => plugins.filter(isSinglePageModule), [plugins]);

  const router = useMemo(() => {
    if (isLoadingThemeConfig || isLoadingRemotes) return null;
    return createBrowserRouter(
      createRoutesFromElements(
        <>
          <Route element={<MainLayout />}>
            <Route path="/*" element={<AvailabilityModule />} />
            {!!themeConfig.termsAndConditionsHtml && (
              <Route
                path={TERMS_OF_USE_ROUTE}
                element={
                  <>
                    <PageTitle title={t('page_titles.terms_of_use')} />
                    <TermsOfUse />
                  </>
                }
              />
            )}
            {!!themeConfig.privacyPolicyHtml && (
              <Route
                path={PRIVACY_POLICY_ROUTE}
                element={
                  <>
                    <PageTitle title={t('page_titles.privacy_policy')} />
                    <PrivacyPolicy />
                  </>
                }
              />
            )}
            <Route
              path={METADATA_ROUTE}
              element={
                <>
                  <PageTitle title="SoilHive - Metadata" />
                  <Metadata />
                </>
              }
            />
            {pluginRoutes.map(({ name, route, Page }) => (
              // Trailing "/*" delegates matching of every nested path (e.g. `/dashboards/list`,
              // `/dashboards/:id`) to the plugin's own router. Without it, react-router only
              // matches the exact `/${route}` URL, so any deeper/direct-linked plugin URL falls
              // through to the host's catch-all and gets redirected to "/".
              <Route
                key={`/${route}/*`}
                path={`/${route}/*`}
                element={
                  <>
                    <PageTitle title={`SoilHive - ${name}`} />
                    <PluginPage Page={Page} />
                  </>
                }
              />
            ))}
          </Route>
          <Route path={`${ADMIN_ROOT}/*`} element={<AdminPortalGuard />}>
            <Route path="*" element={<AdminPortalModule />} />
          </Route>
        </>,
      ),
    );
  }, [isLoadingThemeConfig, isLoadingRemotes, pluginRoutes, t, themeConfig.termsAndConditionsHtml, themeConfig.privacyPolicyHtml]);

  if (!router) return <div />;
  return <RouterProvider router={router} />;
}

export default AppRoutes;
