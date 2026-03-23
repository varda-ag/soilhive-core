import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen } from '@testing-library/react';
import { AdminPortalModule } from '../../src/modules/AdminPortalModule';
import { ADMIN_ROUTES, ADMIN_ROOT } from '../../src/configuration/admin';
import { ADMIN_PORTAL_DATA_MENU, ADMIN_PORTAL_UI_MENU, useEntitlements } from 'hooks/useEntitlementsHook';

jest.mock('components/PageTitle', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="page-title">{title}</div>,
}));

jest.mock('hooks/useEntitlementsHook', () => ({
  __esModule: true,
  ADMIN_PORTAL_DATA_MENU: 0,
  ADMIN_PORTAL_UI_MENU: 1,
  useEntitlements: jest.fn(),
}));

jest.mock('../../src/pages/AdminPortal', () => ({
  TermsAndConditions: () => <div>TermsAndConditions page</div>,
  DatasetsPublication: () => <div>DatasetsPublication page</div>,
  LookAndFeel: () => <div>LookAndFeel page</div>,
  MapBasedFilters: () => <div>MapBasedFilters page</div>,
  MapSettings: () => <div>MapSettings page</div>,
}));

function renderWithRouter(initialPath = ADMIN_ROOT) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={`${ADMIN_ROOT}/*`} element={<AdminPortalModule />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminPortalModule', () => {
  beforeEach(() => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_UI_MENU) return true;
        if (permission === ADMIN_PORTAL_DATA_MENU) return true;
        return false;
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it('redirects index route to terms and conditions if user have access to the UI section', async () => {
    renderWithRouter(ADMIN_ROOT);

    expect(screen.getByText('TermsAndConditions page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Terms & Conditions');
  });

  it('redirects index route to terms and conditions if user have access to the Data section only', async () => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_UI_MENU) return false;
        if (permission === ADMIN_PORTAL_DATA_MENU) return true;
        return false;
      },
    });
    renderWithRouter(ADMIN_ROOT);

    expect(screen.getByText('DatasetsPublication page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Datasets publication');
  });

  it('renders terms and conditions page', () => {
    renderWithRouter(`${ADMIN_ROOT}/${ADMIN_ROUTES.TERMS_AND_CONDITIONS}`);

    expect(screen.getByText('TermsAndConditions page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Terms & Conditions');
  });

  it('renders map settings page', () => {
    renderWithRouter(`${ADMIN_ROOT}/${ADMIN_ROUTES.MAP}`);

    expect(screen.getByText('MapSettings page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Map settings');
  });

  it('renders look and feel page', () => {
    renderWithRouter(`${ADMIN_ROOT}/${ADMIN_ROUTES.LOOK_AND_FEEL}`);

    expect(screen.getByText('LookAndFeel page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Look & Feel');
  });

  it('renders datasets publication page', () => {
    renderWithRouter(`${ADMIN_ROOT}/${ADMIN_ROUTES.DATASETS}`);

    expect(screen.getByText('DatasetsPublication page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Datasets publication');
  });

  it('renders map based filters page', () => {
    renderWithRouter(`${ADMIN_ROOT}/${ADMIN_ROUTES.FILTERS}`);

    expect(screen.getByText('MapBasedFilters page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Map-based filters');
  });
});
