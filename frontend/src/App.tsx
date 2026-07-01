import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { ThemeProvider, NotificationProvider, DownloadsProvider, RemotesProvider } from './contexts';
import './utilities/i18n';
import './App.module.scss';
import AppRoutes from './Routes';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { CookieConsentProvider } from './components/CookieConsentProvider';

export const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <CookieConsentProvider>
          <AuthContextProvider>
            <ThemeProvider>
              <DownloadsProvider>
                <RemotesProvider>
                  <AppRoutes />
                </RemotesProvider>
              </DownloadsProvider>
            </ThemeProvider>
          </AuthContextProvider>
        </CookieConsentProvider>
      </NotificationProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
