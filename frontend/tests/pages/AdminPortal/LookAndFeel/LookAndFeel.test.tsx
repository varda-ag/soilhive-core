import { MemoryRouter, Route, Routes, Outlet } from 'react-router';
import { render, screen } from '@testing-library/react';
import { LookAndFeel } from '../../../../src/pages/AdminPortal/LookAndFeel/LookAndFeel';
import { ADMIN_PATHS } from '../../../../src/configuration/admin';

jest.mock('../../../../src/pages/AdminPortal/LookAndFeel/tabs', () => ({
  LogoTab: () => <div>Logo tab</div>,
  ColorsTab: () => <div>Colors tab</div>,
}));

jest.mock('../../../../src/pages/AdminPortal/LookAndFeel/LookAndFeelLayout', () => ({
  LookAndFeelLayout: () => <Outlet />,
}));

function renderWithRouter(initialPath = ADMIN_PATHS.LOOK_AND_FEEL) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={`${ADMIN_PATHS.LOOK_AND_FEEL}/*`} element={<LookAndFeel />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LookAndFeel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('redirects index route to logo tab', async () => {
    renderWithRouter();

    expect(screen.getByText('Logo tab')).toBeInTheDocument();
  });

  it('renders logo tab', () => {
    renderWithRouter(`${ADMIN_PATHS.LOOK_AND_FEEL_LOGO}`);

    expect(screen.getByText('Logo tab')).toBeInTheDocument();
  });

  it('renders colors tab', () => {
    renderWithRouter(`${ADMIN_PATHS.LOOK_AND_FEEL_COLORS}`);

    expect(screen.getByText('Colors tab')).toBeInTheDocument();
  });
});
