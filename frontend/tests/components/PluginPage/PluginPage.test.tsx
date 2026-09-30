import { render, screen } from '@testing-library/react';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';
import { PluginPage } from 'components/PluginPage/PluginPage';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('hooks/usePluginContext', () => ({
  usePluginContext: () => ({}),
}));

jest.mock('components/SignInPrompt/SignInPrompt', () => ({
  SignInPrompt: ({ title }: { title: string }) => <div data-testid="sign-in-prompt">{title}</div>,
}));

const Page = () => <div data-testid="plugin-page">Plugin page</div>;

describe('PluginPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the plugin page when it needs no signed-in user', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: false });

    render(<PluginPage name="Open" requiresAuth={false} Page={Page} />);

    expect(screen.getByTestId('plugin-page')).toBeInTheDocument();
  });

  it('asks an anonymous visitor to sign in when the plugin needs a signed-in user', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: false });

    render(<PluginPage name="Soil Analysis" requiresAuth Page={Page} />);

    expect(screen.getByTestId('sign-in-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('plugin-page')).not.toBeInTheDocument();
  });

  it('renders the plugin page for a signed-in user', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: true });

    render(<PluginPage name="Soil Analysis" requiresAuth Page={Page} />);

    expect(screen.getByTestId('plugin-page')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-prompt')).not.toBeInTheDocument();
  });
});
