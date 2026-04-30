import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import DropdownMenuItem from 'components/Header/DropdownMenuItem/DropdownMenuItem';
import type { NavMenuEntry } from 'types/components';

let capturedClickAway: () => void = () => {};

jest.mock('react-use', () => ({
  useClickAway: (_ref: unknown, cb: () => void) => {
    capturedClickAway = cb;
  },
}));

jest.mock('components/Header/MenuLink/MenuLink', () => ({
  __esModule: true,
  default: ({ to, text, onClick }: { to: string; text: string; onClick?: () => void }) => (
    <a data-testid="dropdown-menu-link" href={to} onClick={onClick}>
      {text}
    </a>
  ),
}));

const mockMenuEntry: NavMenuEntry = {
  name: 'nav_menu.legal',
  type: 'internal',
  children: [{ name: 'nav_menu.terms', route: '/terms-of-use', type: 'internal' }],
};

const renderComponent = (menuEntry: NavMenuEntry = mockMenuEntry) =>
  render(
    <MemoryRouter>
      <DropdownMenuItem menuEntry={menuEntry} />
    </MemoryRouter>,
  );

describe('DropdownMenuItem component', () => {
  afterEach(() => {
    capturedClickAway = () => {};
    jest.clearAllMocks();
  });

  it('renders the toggle button with translated label', () => {
    renderComponent();
    const toggle = screen.getByRole('button');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Legal');
  });

  it('renders closed by default', () => {
    const { container } = renderComponent();
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('opens the menu when toggle is clicked', () => {
    const { container } = renderComponent();
    fireEvent.click(screen.getByRole('button'));
    expect(container.firstChild).toHaveClass('Opened');
  });

  it('closes the menu when toggle is clicked again', () => {
    const { container } = renderComponent();
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('renders submenu entries with correct text and route', () => {
    renderComponent();
    const link = screen.getByTestId('dropdown-menu-link');
    expect(link).toHaveTextContent('Terms of use');
    expect(link).toHaveAttribute('href', '/terms-of-use');
  });

  it('renders all submenu entries', () => {
    const entry: NavMenuEntry = {
      name: 'nav_menu.legal',
      type: 'internal',
      children: [
        { name: 'nav_menu.terms', route: '/terms-of-use', type: 'internal' },
        { name: 'nav_menu.home', route: '/', type: 'internal' },
      ],
    };
    renderComponent(entry);
    expect(screen.getAllByTestId('dropdown-menu-link')).toHaveLength(2);
  });

  it('closes the menu when a submenu link is clicked', () => {
    const { container } = renderComponent();
    fireEvent.click(screen.getByRole('button'));
    expect(container.firstChild).toHaveClass('Opened');
    fireEvent.click(screen.getByTestId('dropdown-menu-link'));
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('closes the menu on outside click via useClickAway', () => {
    const { container } = renderComponent();
    fireEvent.click(screen.getByRole('button'));
    expect(container.firstChild).toHaveClass('Opened');
    act(() => {
      capturedClickAway();
    });
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('does not close when useClickAway fires while already closed', () => {
    const { container } = renderComponent();
    act(() => {
      capturedClickAway();
    });
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('renders no submenu links when children is undefined', () => {
    const entry: NavMenuEntry = { name: 'nav_menu.home', route: '/', type: 'internal' };
    renderComponent(entry);
    expect(screen.queryByTestId('dropdown-menu-link')).not.toBeInTheDocument();
  });

  it('matches snapshot when closed', () => {
    const { container } = renderComponent();
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when open', () => {
    const { container } = renderComponent();
    fireEvent.click(screen.getByRole('button'));
    expect(container).toMatchSnapshot();
  });
});
