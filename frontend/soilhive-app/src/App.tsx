import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { ThemeProvider, NotificationProvider, DownloadsProvider } from './contexts';
import './utilities/i18n';
import './App.module.scss';
import AppRoutes from './Routes';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <AuthContextProvider>
          <ThemeProvider>
            <DownloadsProvider>
              <AppRoutes />
            </DownloadsProvider>
          </ThemeProvider>
        </AuthContextProvider>
      </NotificationProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
