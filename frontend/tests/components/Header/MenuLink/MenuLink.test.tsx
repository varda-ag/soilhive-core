import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import MenuLink from 'components/Header/MenuLink/MenuLink';

const MockIcon = () => <svg data-testid="menu-link-icon" />;

const renderInternal = (props: Partial<Parameters<typeof MenuLink>[0]> = {}) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <MenuLink to="/about" text="About" {...props} />
    </MemoryRouter>,
  );

const renderExternal = (props: Partial<Parameters<typeof MenuLink>[0]> = {}) =>
  renderInternal({ type: 'external', to: 'https://example.com', text: 'External', ...props });

describe('MenuLink component', () => {
  describe('internal link (default)', () => {
    it('renders a NavLink with correct href and text', () => {
      renderInternal();
      const link = screen.getByTestId('sh-header-nav-link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/about');
      expect(link).toHaveTextContent('About');
    });

    it('wraps text in a span', () => {
      renderInternal({ textClassName: 'LinkText' });
      const span = screen.getByText('About');
      expect(span.tagName).toBe('SPAN');
      expect(span).toHaveClass('LinkText');
    });

    it('applies className when inactive', () => {
      renderInternal({ to: '/about', className: 'NavItem' });
      expect(screen.getByTestId('sh-header-nav-link')).toHaveClass('NavItem');
    });

    it('applies activeClassName when route matches', () => {
      render(
        <MemoryRouter initialEntries={['/about']}>
          <MenuLink to="/about" text="About" activeClassName="Active" />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('sh-header-nav-link')).toHaveClass('Active');
    });

    it('does not apply activeClassName when route does not match', () => {
      render(
        <MemoryRouter initialEntries={['/other']}>
          <MenuLink to="/about" text="About" activeClassName="Active" />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('sh-header-nav-link')).not.toHaveClass('Active');
    });

    it('renders Icon when provided', () => {
      renderInternal({ Icon: MockIcon });
      expect(screen.getByTestId('menu-link-icon')).toBeInTheDocument();
    });

    it('does not render Icon when not provided', () => {
      renderInternal();
      expect(screen.queryByTestId('menu-link-icon')).not.toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
      const onClick = jest.fn();
      renderInternal({ onClick });
      fireEvent.click(screen.getByTestId('sh-header-nav-link'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('external link', () => {
    it('renders an anchor tag (not NavLink) with correct href', () => {
      renderExternal();
      const link = screen.getByText('External').closest('a');
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).not.toHaveAttribute('data-testid', 'sh-header-nav-link');
    });

    it('opens in a new tab with noopener noreferrer', () => {
      renderExternal();
      const link = screen.getByText('External').closest('a')!;
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('applies className to external link', () => {
      renderExternal({ className: 'ExternalNav' });
      const link = screen.getByText('External').closest('a')!;
      expect(link).toHaveClass('ExternalNav');
    });

    it('renders Icon for external link', () => {
      renderExternal({ Icon: MockIcon });
      expect(screen.getByTestId('menu-link-icon')).toBeInTheDocument();
    });

    it('calls onClick when external link is clicked', () => {
      const onClick = jest.fn();
      renderExternal({ onClick });
      fireEvent.click(screen.getByText('External').closest('a')!);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  it('matches snapshot for internal link', () => {
    const { container } = renderInternal({ className: 'NavItem', activeClassName: 'Active', Icon: MockIcon });
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for external link', () => {
    const { container } = renderExternal({ className: 'NavItem', Icon: MockIcon });
    expect(container).toMatchSnapshot();
  });
});
