import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './App.module.scss';
import PageTitle from './components/PageTitle';
import MainLayout from './layouts/MainLayout';
import Admin from './pages/Admin';
import { singlePages } from './utilities/moduleFederation';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthContextProvider } from './auth/AuthContextProvider';
import Legal from './pages/Legal';
import { NotificationProvider } from './contexts/NotificationsContext';
import AvailabilityModule from './modules/AvailabilityModule';
import { DownloadsProvider } from './contexts/DownloadsContext';
import { useTranslation } from 'react-i18next';

import './utilities/i18n';

const queryClient = new QueryClient();

function App() {
  const { t } = useTranslation('common');
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContextProvider>
        <ThemeProvider>
          <NotificationProvider>
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
                      path="/admin"
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
                </Routes>
              </BrowserRouter>
            </DownloadsProvider>
          </NotificationProvider>
        </ThemeProvider>
      </AuthContextProvider>
    </QueryClientProvider>
  );
}

export default App;
