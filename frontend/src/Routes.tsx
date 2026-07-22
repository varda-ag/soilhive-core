import { useMemo } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router';
import PageTitle from './components/PageTitle';
import { ADMIN_ROOT } from './configuration/admin';
import { AdminPortalGuard } from './guards/AdminPortalGuard';
import { useAuthContext } from './auth/AuthContextProvider';
import useRemotes from './hooks/useRemotes';
import useTheme from './hooks/useTheme';
import { MainLayout } from './layouts';
import { AdminPortalModule } from './modules/AdminPortalModule';
import AvailabilityModule from './modules/AvailabilityModule';
import TermsOfUse from './pages/TermsOfUse';
import Metadata from './pages/Metadata';
import PrivacyPolicy from 'pages/PrivacyPolicy';
import type { PluginContext } from './types/plugins';
import { isSinglePageModule } from './utilities/moduleFederation';
import './utilities/i18n';

import './App.module.scss';

export const queryClient = new QueryClient();

function AppRoutes() {
  const { t } = useTranslation('common');
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  const { plugins, isLoadingRemotes } = useRemotes();
  const pluginRoutes = useMemo(() => plugins.filter(isSinglePageModule), [plugins]);
  const { user } = useAuthContext();
  // Narrow explicitly rather than passing `user` through as-is: it carries
  // access_token/refresh_token/id_token, which PluginContext's thin contract
  // must not leak to plugins.
  const pluginContext = useMemo<PluginContext>(
    () => ({
      user: user ? { profile: { name: user.profile?.name, email: user.profile?.email } } : user,
    }),
    [user],
  );

  const router = useMemo(() => {
    if (isLoadingThemeConfig || isLoadingRemotes) return null;
    return createBrowserRouter(
      createRoutesFromElements(
        <>
          <Route element={<MainLayout />}>
            <Route path="/*" element={<AvailabilityModule />} />
            {!!themeConfig.termsAndConditionsHtml && (
              <Route
                path="/terms-of-use"
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
                path="/privacy-policy"
                element={
                  <>
                    <PageTitle title={t('page_titles.privacy_policy')} />
                    <PrivacyPolicy />
                  </>
                }
              />
            )}
            <Route
              path="/datasets/:id"
              element={
                <>
                  <PageTitle title="SoilHive - Metadata" />
                  <Metadata />
                </>
              }
            />
            {pluginRoutes.map(({ name, route, Page }) => (
              <Route
                key={`/${route}`}
                path={`/${route}`}
                element={
                  <>
                    <PageTitle title={`SoilHive - ${name}`} />
                    <Page context={pluginContext} />
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
  }, [
    isLoadingThemeConfig,
    isLoadingRemotes,
    pluginRoutes,
    pluginContext,
    t,
    themeConfig.termsAndConditionsHtml,
    themeConfig.privacyPolicyHtml,
  ]);

  if (!router) return <div />;
  return <RouterProvider router={router} />;
}

export default AppRoutes;
