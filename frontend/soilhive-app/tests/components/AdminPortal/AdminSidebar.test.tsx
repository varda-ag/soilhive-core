import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AdminSidebar } from 'components/AdminPortal/AdminSidebar/AdminSidebar';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

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

function renderSidebar(initialPath = '/adminportal/terms-and-conditions') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AdminSidebar />
    </MemoryRouter>,
  );
}

describe('AdminSidebar', () => {
  const logoutMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuthContext as jest.Mock).mockReturnValue({
      logout: logoutMock,
      isAuthenticated: true,
      isLoading: false,
      user: null,
    });
  });

  it('renders sidebar and matches snapshot', () => {
    const { container } = renderSidebar();

    expect(screen.getByTestId('sh-admin-sidebar')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders translated link titles and logout title when expanded', () => {
    renderSidebar();

    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(5);
    expect(screen.getByText('Terms & Conditions')).toBeInTheDocument();
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

    expect(screen.getAllByTestId('sh-admin-sidebarlink')).toHaveLength(5);
    expect(screen.queryByText('Terms & Conditions')).not.toBeInTheDocument();
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

    expect(screen.getByText('Terms & Conditions')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('calls logout and navigates to homepage on logout click', () => {
    const { container } = renderSidebar();

    fireEvent.click(container.querySelector('.Logout') as Element);

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
