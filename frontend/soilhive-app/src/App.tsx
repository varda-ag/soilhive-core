import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './App.module.scss';
import PageTitle from './components/PageTitle';
import MainLayout from './layouts/MainLayout';
import Homepage from './pages/Homepage';
import Admin from './pages/Admin';
import { singlePages } from './utilities/moduleFederation';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthContextProvider } from './auth/AuthContextProvider';
import Legal from './pages/Legal';
import { AvailabilityProvider } from './contexts/AvailabilityContext';
import { NotificationProvider } from './contexts/NotificationsContext';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContextProvider>
        <ThemeProvider>
          <NotificationProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<MainLayout />}>
                  <Route
                    index
                    element={
                      <>
                        <PageTitle title="SoilHive - Home" />
                        <AvailabilityProvider>
                          <Homepage />
                        </AvailabilityProvider>
                      </>
                    }
                  />
                  <Route
                    path="/donation"
                    element={
                      <>
                        <PageTitle title="SoilHive - Donation" />
                      </>
                    }
                  />
                  <Route
                    path="/legal"
                    element={
                      <>
                        <PageTitle title="SoilHive - Admin" />
                        <Legal />
                      </>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <>
                        <PageTitle title="SoilHive - Admin" />
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
          </NotificationProvider>
        </ThemeProvider>
      </AuthContextProvider>
    </QueryClientProvider>
  );
}

export default App;
