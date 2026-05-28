import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AdminSidebar } from 'components/AdminPortal/AdminSidebar/AdminSidebar';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { ADMIN_PORTAL_DATA_MENU, ADMIN_PORTAL_UI_MENU, useEntitlements } from 'hooks/useEntitlementsHook';
import useTheme from 'hooks/useTheme';
import { ADMIN_ROOT } from '../../../src/configuration/admin';

const navigateMock = jest.fn();
jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('react-router', () => {
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

jest.mock('hooks/useEntitlementsHook', () => ({
  __esModule: true,
  ADMIN_PORTAL_DATA_MENU: 0,
  ADMIN_PORTAL_UI_MENU: 1,
  useEntitlements: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }));

function renderSidebar(initialPath = `${ADMIN_ROOT}/terms-and-conditions`) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AdminSidebar />
    </MemoryRouter>,
  );
}

describe('AdminSidebar', () => {
  const logoutMock = jest.fn();

  beforeEach(() => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_UI_MENU) return true;
        if (permission === ADMIN_PORTAL_DATA_MENU) return true;
        return false;
      },
    });

    (useAuthContext as jest.Mock).mockReturnValue({
      logout: logoutMock,
    });

    (useTheme as jest.Mock).mockReturnValue({
      themeConfig: { termsAndConditionsHtml: '<p>Terms</p>', privacyPolicyHtml: '<p>Privacy</p>' },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders sidebar for user with all permissions and matches snapshot', () => {
    const { container } = renderSidebar();

    expect(screen.getByTestId('sh-admin-sidebar')).toBeInTheDocument();
    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(7);
    expect(container).toMatchSnapshot();
  });

  it('renders sidebar for user with only ADMIN_PORTAL_DATA_MENU permission and matches snapshot', async () => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_UI_MENU) return false;
        if (permission === ADMIN_PORTAL_DATA_MENU) return true;
        return false;
      },
    });
    const { container } = renderSidebar(`${ADMIN_ROOT}/datasets`);

    expect(screen.getByTestId('sh-admin-sidebar')).toBeInTheDocument();
    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(2);
    expect(container).toMatchSnapshot();
  });

  it('renders sidebar for user with only ADMIN_PORTAL_UI_MENU permission and matches snapshot', async () => {
    (useEntitlements as jest.Mock).mockReturnValue({
      can: (permission: number) => {
        if (permission === ADMIN_PORTAL_UI_MENU) return true;
        if (permission === ADMIN_PORTAL_DATA_MENU) return false;
        return false;
      },
    });
    const { container } = renderSidebar();

    expect(screen.getByTestId('sh-admin-sidebar')).toBeInTheDocument();
    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(5);
    expect(container).toMatchSnapshot();
  });

  it('renders translated link titles and logout title when expanded', () => {
    renderSidebar();

    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(7);
    expect(screen.getByText('Terms of use')).toBeInTheDocument();
    expect(screen.getByText('Privacy policy')).toBeInTheDocument();
    expect(screen.getByText('Notification Banner')).toBeInTheDocument();
    expect(screen.getByText('Map settings')).toBeInTheDocument();
    expect(screen.getByText('Look & Feel')).toBeInTheDocument();
    expect(screen.getByText('Datasets publication')).toBeInTheDocument();
    expect(screen.getByText('Map-based filters')).toBeInTheDocument();

    expect(screen.getByTestId('sh-admin-sidebar-logout')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('collapses sidebar and hides link/logout text', () => {
    const { container } = renderSidebar();

    fireEvent.click(container.querySelector('.Collapser') as Element);

    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(7);
    expect(screen.queryByText('Terms of use')).not.toBeInTheDocument();
    expect(screen.queryByText('Privacy policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Notification Banner')).not.toBeInTheDocument();
    expect(screen.queryByText('Map settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Look & Feel')).not.toBeInTheDocument();
    expect(screen.queryByText('Datasets publication')).not.toBeInTheDocument();
    expect(screen.queryByText('Map-based filters')).not.toBeInTheDocument();

    expect(screen.getByTestId('sh-admin-sidebar-logout')).toBeInTheDocument();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();

    expect(screen.getByTestId('sh-admin-sidebar')).toHaveClass('Collapsed');
  });

  it('expands sidebar again after second click', () => {
    const { container } = renderSidebar();

    const collapser = container.querySelector('.Collapser') as Element;

    fireEvent.click(collapser);
    fireEvent.click(collapser);

    expect(screen.getByText('Terms of use')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('calls logout and navigates to homepage on logout click', () => {
    const { container } = renderSidebar();

    fireEvent.click(container.querySelector('.Logout') as Element);

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('Terms link has Marked class when termsAndConditionsHtml is empty', () => {
    (useTheme as jest.Mock).mockReturnValue({
      themeConfig: { termsAndConditionsHtml: '', privacyPolicyHtml: '<p>Privacy</p>' },
    });
    renderSidebar();
    const termsLink = screen.getByText('Terms of use').closest('[data-testid="sh-admin-sidebarlink"]');
    expect(termsLink).toHaveClass('Marked');
  });

  it('Terms link does not have Marked class when termsAndConditionsHtml has content', () => {
    renderSidebar();
    const termsLink = screen.getByText('Terms of use').closest('[data-testid="sh-admin-sidebarlink"]');
    expect(termsLink).not.toHaveClass('Marked');
  });

  it('Privacy policy link has Marked class when privacyPolicyHtml is empty', () => {
    (useTheme as jest.Mock).mockReturnValue({
      themeConfig: { termsAndConditionsHtml: '<p>Terms</p>', privacyPolicyHtml: '' },
    });
    renderSidebar();
    const privacyLink = screen.getByText('Privacy policy').closest('[data-testid="sh-admin-sidebarlink"]');
    expect(privacyLink).toHaveClass('Marked');
  });

  it('Privacy policy link does not have Marked class when privacyPolicyHtml has content', () => {
    renderSidebar();
    const privacyLink = screen.getByText('Privacy policy').closest('[data-testid="sh-admin-sidebarlink"]');
    expect(privacyLink).not.toHaveClass('Marked');
  });
});
