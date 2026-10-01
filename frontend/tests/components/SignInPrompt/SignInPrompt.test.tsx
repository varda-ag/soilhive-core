import { render, screen } from '@testing-library/react';
import { SignInPrompt } from 'components/SignInPrompt/SignInPrompt';

jest.mock('components/AccountWidget/LoginButton/LoginButton', () => ({
  LoginButton: () => <button type="button">Log in</button>,
}));

describe('SignInPrompt', () => {
  it('shows the title, the explanation and the login button', () => {
    render(<SignInPrompt title="Log in to use Soil Analysis" />);

    expect(screen.getByRole('heading', { name: 'Log in to use Soil Analysis' })).toBeInTheDocument();
    expect(screen.getByText('You need to be logged in to view this page.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });
});
