import { fireEvent, render, screen } from '@testing-library/react';
import type { PluginLoginPageProps } from 'types/plugins';
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
const LoginPage = ({ login, signup }: PluginLoginPageProps) => (
  <div data-testid="plugin-login-page">
    <button onClick={login}>login</button>
    <button onClick={signup}>signup</button>
  </div>
);

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

  it("shows the plugin's own login page instead of the prompt, with the host's sign-in and sign-up", () => {
    const login = jest.fn();
    const signup = jest.fn();
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: false, login, signup });

    render(<PluginPage name="Soil Analysis" requiresAuth Page={Page} LoginPage={LoginPage} />);
    fireEvent.click(screen.getByRole('button', { name: 'login' }));
    fireEvent.click(screen.getByRole('button', { name: 'signup' }));

    expect(screen.queryByTestId('sign-in-prompt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plugin-page')).not.toBeInTheDocument();
    expect(login).toHaveBeenCalledWith();
    expect(signup).toHaveBeenCalledWith();
  });

  it('renders the plugin page, not its login page, for a signed-in user or a plugin that needs no sign-in', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: true });
    const { rerender } = render(<PluginPage name="Soil Analysis" requiresAuth Page={Page} LoginPage={LoginPage} />);
    expect(screen.getByTestId('plugin-page')).toBeInTheDocument();

    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: false });
    rerender(<PluginPage name="Open" requiresAuth={false} Page={Page} LoginPage={LoginPage} />);
    expect(screen.getByTestId('plugin-page')).toBeInTheDocument();
    expect(screen.queryByTestId('plugin-login-page')).not.toBeInTheDocument();
  });

  it('renders the plugin page for a signed-in user', () => {
    (useAuthContext as jest.Mock).mockReturnValue({ isAuthenticated: true });

    render(<PluginPage name="Soil Analysis" requiresAuth Page={Page} />);

    expect(screen.getByTestId('plugin-page')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in-prompt')).not.toBeInTheDocument();
  });
});
