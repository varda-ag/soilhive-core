import { render, screen } from '@testing-library/react';
import { LookAndFeelLayout } from '../../../../src/pages/AdminPortal/LookAndFeel/LookAndFeelLayout';

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}));

jest.mock('components/AdminPortal/LookAndFeel/LookAndFeelTabs/LookAndFeelTabs', () => ({
  LookAndFeelTabs: () => <div data-testid="look-and-feel-tabs">LookAndFeelTabs component</div>,
}));

jest.mock('../../../../src/contexts/LookAndFeelContext', () => ({
  LookAndFeelProvider: ({ children }: any) => <div data-testid="look-and-feel-provider">{children}</div>,
}));

describe('LookAndFeelLayout', () => {
  it('renders component and matches snapshot', () => {
    const { container } = render(<LookAndFeelLayout />);

    expect(screen.getByTestId('look-and-feel-provider')).toBeInTheDocument();
    expect(screen.getByTestId('look-and-feel-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });
});
