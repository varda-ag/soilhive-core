import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import MobileDropdownMenuItem from 'components/MobileMenu/MobileDropdownMenuItem/MobileDropdownMenuItem';
import type { NavMenuEntry } from 'types/components';

jest.mock('components/Header/MenuLink/MenuLink', () => ({
  __esModule: true,
  default: ({ to, text, onClick }: { to: string; text: string; onClick?: () => void }) => (
    <a data-testid="mobile-menu-link" href={to} onClick={onClick}>
      {text}
    </a>
  ),
}));

const MockIcon = () => <svg data-testid="toggler-icon" />;

const mockMenuEntry: NavMenuEntry = {
  name: 'nav_menu.legal',
  type: 'internal',
  children: [{ name: 'nav_menu.terms', route: '/terms-of-use', type: 'internal' }],
};

const renderComponent = (props: Partial<{ menuEntry: NavMenuEntry; onLinkClick: () => void }> = {}) =>
  render(
    <MemoryRouter>
      <MobileDropdownMenuItem menuEntry={mockMenuEntry} {...props} />
    </MemoryRouter>,
  );

describe('MobileDropdownMenuItem component', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the toggler button', () => {
    renderComponent();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders translated menuEntry name as the toggler label', () => {
    renderComponent();
    expect(screen.getByRole('button')).toHaveTextContent('Legal');
  });

  it('renders correct toggler label for a different menu entry', () => {
    const entry: NavMenuEntry = { name: 'nav_menu.home', route: '/', type: 'internal' };
    renderComponent({ menuEntry: entry });
    expect(screen.getByRole('button')).toHaveTextContent('Home');
  });

  it('renders closed by default', () => {
    const { container } = renderComponent();
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('opens the menu when toggler is clicked', () => {
    const { container } = renderComponent();
    fireEvent.click(screen.getByRole('button'));
    expect(container.firstChild).toHaveClass('Opened');
  });

  it('closes the menu when toggler is clicked again', () => {
    const { container } = renderComponent();
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(container.firstChild).not.toHaveClass('Opened');
  });

  it('renders submenu entries with correct text and route', () => {
    renderComponent();
    const link = screen.getByTestId('mobile-menu-link');
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
    renderComponent({ menuEntry: entry });
    expect(screen.getAllByTestId('mobile-menu-link')).toHaveLength(2);
  });

  it('calls onLinkClick when a submenu link is clicked', () => {
    const onLinkClick = jest.fn();
    renderComponent({ onLinkClick });
    fireEvent.click(screen.getByTestId('mobile-menu-link'));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onLinkClick is not provided', () => {
    renderComponent();
    expect(() => fireEvent.click(screen.getByTestId('mobile-menu-link'))).not.toThrow();
  });

  it('renders no submenu links when children is undefined', () => {
    const entry: NavMenuEntry = { name: 'nav_menu.home', route: '/', type: 'internal' };
    renderComponent({ menuEntry: entry });
    expect(screen.queryByTestId('mobile-menu-link')).not.toBeInTheDocument();
  });

  it('renders menuEntry.Icon in the toggler when provided', () => {
    renderComponent({ menuEntry: { ...mockMenuEntry, Icon: MockIcon } });
    expect(screen.getByTestId('toggler-icon')).toBeInTheDocument();
  });

  it('does not render an icon in the toggler when menuEntry.Icon is absent', () => {
    renderComponent();
    expect(screen.queryByTestId('toggler-icon')).not.toBeInTheDocument();
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
