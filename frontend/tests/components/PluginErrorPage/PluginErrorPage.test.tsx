import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, Outlet, Route, RouterProvider, Routes } from 'react-router';
import PluginErrorPage from 'components/PluginErrorPage/PluginErrorPage';

// errorElement only works with a data router, which builds a fetch Request for every navigation;
// jsdom doesn't provide one. These routes have no loaders or actions, so only url, method and signal
// are read.
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = class {
    url: string;
    method: string;
    signal?: AbortSignal;
    constructor(url: string, init?: { method?: string; signal?: AbortSignal }) {
      this.url = url;
      this.method = init?.method ?? 'GET';
      this.signal = init?.signal;
    }
  } as unknown as typeof Request;
}

function CrashingPlugin(): never {
  throw new Error('plugin render failure');
}

// Plugins mount their own descendant <Routes> under the host's route, like the real ones do.
function PluginWithNestedRoutes() {
  return (
    <Routes>
      <Route path="*" element={<CrashingPlugin />} />
    </Routes>
  );
}

const renderRouter = (initialPath = '/plugin') => {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <div data-testid="host-layout" />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <div data-testid="home-page" /> },
          { path: '/plugin/*', element: <CrashingPlugin />, errorElement: <PluginErrorPage name="Crashy" /> },
          { path: '/nested/*', element: <PluginWithNestedRoutes />, errorElement: <PluginErrorPage name="Nested" /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe('PluginErrorPage component', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React and the component itself log the caught error.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('replaces only the crashed plugin route, keeping the host layout', () => {
    renderRouter();
    expect(screen.getByTestId('host-layout')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plugin error');
  });

  it("catches an error thrown inside the plugin's own nested routes", () => {
    renderRouter('/nested/deep/path');
    expect(screen.getByTestId('host-layout')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plugin error');
    expect(document.title).toBe('SoilHive - Nested');
  });

  it('logs the caught error with the plugin name', () => {
    renderRouter();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Plugin "Crashy" crashed while rendering',
      expect.objectContaining({ message: 'plugin render failure' }),
    );
  });

  it('sets the page title for the plugin', () => {
    renderRouter();
    expect(document.title).toBe('SoilHive - Crashy');
  });

  it('navigates home and recovers when the button is clicked', () => {
    const router = renderRouter();
    fireEvent.click(screen.getByTestId('plugin-error-page-home-button'));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
