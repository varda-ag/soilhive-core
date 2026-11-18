import { fireEvent, render, screen } from '@testing-library/react';
import { LoginPageTemplate } from 'components/UI/LoginPageTemplate/LoginPageTemplate';

jest.mock('react-router', () => ({
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));

const renderTemplate = () => {
  const props = {
    title: 'Log in',
    loginButtonText: 'Sign in',
    signupButtonText: 'Sign up',
    image: 'login.png',
    login: jest.fn(),
    signup: jest.fn(),
  };
  render(
    <LoginPageTemplate {...props}>
      <p data-testid="child">Why sign in</p>
    </LoginPageTemplate>,
  );
  return props;
};

describe('LoginPageTemplate', () => {
  it('shows the title, then the children, then the buttons', () => {
    renderTemplate();

    const title = screen.getByRole('heading', { name: 'Log in' });
    const child = screen.getByTestId('child');
    const loginButton = screen.getByTestId('sh-ui-loginpagetemplate-login');
    expect(title.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(child.compareDocumentPosition(loginButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the button texts and the image', () => {
    renderTemplate();

    expect(screen.getByTestId('sh-ui-loginpagetemplate-login')).toHaveTextContent('Sign in');
    expect(screen.getByTestId('sh-ui-loginpagetemplate-signup')).toHaveTextContent('Sign up');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'login.png');
  });

  it('calls login, without arguments, from the login button', () => {
    const { login, signup } = renderTemplate();

    fireEvent.click(screen.getByTestId('sh-ui-loginpagetemplate-login'));

    expect(login).toHaveBeenCalledWith();
    expect(signup).not.toHaveBeenCalled();
  });

  it('calls signup, without arguments, from the signup button', () => {
    const { login, signup } = renderTemplate();

    fireEvent.click(screen.getByTestId('sh-ui-loginpagetemplate-signup'));

    expect(signup).toHaveBeenCalledWith();
    expect(login).not.toHaveBeenCalled();
  });
});
