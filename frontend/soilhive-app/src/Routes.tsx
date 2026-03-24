import { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import PageTitle from './components/PageTitle';
import { ADMIN_ROOT } from './configuration/admin';
import { AdminPortalGuard } from './guards/AdminPortalGuard';
import useTheme from './hooks/useTheme';
import { MainLayout } from './layouts';
import { AdminPortalModule } from './modules/AdminPortalModule';
import AvailabilityModule from './modules/AvailabilityModule';
import Admin from './pages/Admin';
import Legal from './pages/Legal';
import './utilities/i18n';
import { singlePages } from './utilities/moduleFederation';

import './App.module.scss';

export const queryClient = new QueryClient();

function AppRoutes() {
  const { t } = useTranslation('common');
  const { isLoadingTermsAndConditions, termsAndConditionsHtml } = useTheme();
  if (isLoadingTermsAndConditions) {
    return <div></div>;
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<AvailabilityModule />} />
          <Route
            path="/donation"
            element={
              <>
                <PageTitle title={t('page_titles.donation')} />
              </>
            }
          />
          {!!termsAndConditionsHtml && (
            <Route
              path="/legal"
              element={
                <>
                  <PageTitle title={t('page_titles.legal')} />
                  <Legal html={termsAndConditionsHtml} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;
