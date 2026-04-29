import { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Route, Routes } from 'react-router';
import PageTitle from './components/PageTitle';
import { ADMIN_ROOT } from './configuration/admin';
import { AdminPortalGuard } from './guards/AdminPortalGuard';
import useTheme from './hooks/useTheme';
import { MainLayout } from './layouts';
import { AdminPortalModule } from './modules/AdminPortalModule';
import AvailabilityModule from './modules/AvailabilityModule';
import Admin from './pages/Admin';
import TermsOfUse from './pages/TermsOfUse';
import Metadata from './pages/Metadata';
import PrivacyPolicy from 'pages/PrivacyPolicy';
import './utilities/i18n';
import { singlePages } from './utilities/moduleFederation';

import './App.module.scss';

export const queryClient = new QueryClient();

function AppRoutes() {
  const { t } = useTranslation('common');
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  if (isLoadingThemeConfig) {
    return <div></div>;
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/*" element={<AvailabilityModule />} />
          <Route
            path="/donation"
            element={
              <>
                <PageTitle title={t('page_titles.donation')} />
              </>
            }
          />
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
            path="/admin-old"
            element={
              <>
                <PageTitle title={t('page_titles.admin')} />
                <Admin />
              </>
            }
          />
          <Route
            path="/metadata"
            element={
              <>
                <PageTitle title="SoilHive - Metadata" />
                <Metadata />
              </>
            }
          />
          {singlePages.map(({ name, route, Page }) => (
            <Route
              key={`/${route}`}
              path={`/${route}`}
              element={
                <>
                  <PageTitle title={`SoilHive - ${name}`} />
                  <Page />
                </>
              }
            />
          ))}
        </Route>
        <Route path={`${ADMIN_ROOT}/*`} element={<AdminPortalGuard />}>
          <Route path="*" element={<AdminPortalModule />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
