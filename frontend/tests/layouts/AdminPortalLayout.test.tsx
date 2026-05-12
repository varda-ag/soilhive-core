import { render, screen } from '@testing-library/react';
import { AdminPortalLayout } from '../../src/layouts/AdminPortalLayout/AdminPortalLayout';

jest.mock('components/AdminPortal/AdminHeader/AdminHeader', () => ({
  AdminHeader: () => <div data-testid="header">Header</div>,
}));

jest.mock('components/AdminPortal/AdminSidebar/AdminSidebar', () => ({
  AdminSidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

describe('AdminPortalLayout', () => {
  it('renders AdminPortalLayout and matches the snapshot', () => {
    const { container } = render(<AdminPortalLayout />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});
