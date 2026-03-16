import { MemoryRouter, Route, Routes, Outlet } from 'react-router';
import { render, screen } from '@testing-library/react';
import { AdminPortalModule } from '../../src/modules/AdminPortalModule';
import { ADMIN_ROUTES, ADMIN_ROOT } from '../../src/configuration/admin';

jest.mock('components/PageTitle', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="page-title">{title}</div>,
}));

jest.mock('../../src/guards/AdminPortalGuard', () => ({
  AdminPortalGuard: () => <Outlet />,
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
        <Route path="/adminportal/*" element={<AdminPortalModule />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminPortalModule', () => {
  it('redirects index route to terms and conditions', async () => {
    renderWithRouter(ADMIN_ROOT);

    expect(screen.getByText('TermsAndConditions page')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('SoilHive - Terms & Conditions');
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
