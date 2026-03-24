import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { ThemeProvider, NotificationProvider, DownloadsProvider } from './contexts';
import { ADMIN_ROOT } from './configuration/admin';
import AvailabilityModule from './modules/AvailabilityModule';
import { AdminPortalModule } from './modules/AdminPortalModule';
import { MainLayout } from './layouts';
import PageTitle from './components/PageTitle';
import Admin from './pages/Admin';
import Legal from './pages/Legal';
import { AdminPortalGuard } from './guards/AdminPortalGuard';
import { singlePages } from './utilities/moduleFederation';
import './utilities/i18n';

import './App.module.scss';

const queryClient = new QueryClient();

function App() {
  const { t } = useTranslation('common');
  return (
    <NotificationProvider>
      <QueryClientProvider client={queryClient}>
        <AuthContextProvider>
          <ThemeProvider>
            <DownloadsProvider>
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
                    <Route
                      path="/legal"
                      element={
                        <>
                          <PageTitle title={t('page_titles.legal')} />
                          <Legal />
                        </>
                      }
                    />
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
                </Routes>
              </BrowserRouter>
            </DownloadsProvider>
          </ThemeProvider>
        </AuthContextProvider>
      </QueryClientProvider>
    </NotificationProvider>
  );
}

export default App;
