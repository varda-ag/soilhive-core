import { render, screen } from '@testing-library/react';
import { MainLayout } from '../../src/layouts/MainLayout/MainLayout';

jest.mock('components/Header/Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header">Header</div>,
}));

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

describe('MainLayout', () => {
  it('renders MainLayout and matches the snapshot', () => {
    const { container } = render(<MainLayout />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });
});
