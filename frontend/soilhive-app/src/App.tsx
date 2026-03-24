import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContextProvider } from './auth/AuthContextProvider';
import { ThemeProvider, NotificationProvider, DownloadsProvider } from './contexts';
import './utilities/i18n';
import './App.module.scss';
import AppRoutes from './Routes';

export const queryClient = new QueryClient();

function App() {
  return (
    <NotificationProvider>
      <QueryClientProvider client={queryClient}>
        <AuthContextProvider>
          <ThemeProvider>
            <DownloadsProvider>
              <AppRoutes />
            </DownloadsProvider>
          </ThemeProvider>
        </AuthContextProvider>
      </QueryClientProvider>
    </NotificationProvider>
  );
}

export default App;
