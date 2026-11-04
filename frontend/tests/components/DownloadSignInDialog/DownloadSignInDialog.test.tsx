import { render, screen, fireEvent } from '@testing-library/react';
import { DownloadSignInDialog } from 'components/DownloadSignInDialog/DownloadSignInDialog';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('components/Dialog/Dialog', () => ({
  Dialog: ({ visible, header, ariaLabel, closeOnOverlay, secondaryText, primaryText, onPrimary, onSecondary, children }: any) =>
    visible ? (
      <div data-testid="mock-dialog" aria-label={ariaLabel} data-header={header ?? 'none'} data-close-on-overlay={closeOnOverlay}>
        <div data-testid="dialog-content">{children}</div>
        <button onClick={onSecondary}>{secondaryText}</button>
        <button onClick={onPrimary}>{primaryText}</button>
      </div>
    ) : null,
}));

describe('DownloadSignInDialog', () => {
  const login = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthContext as jest.Mock).mockReturnValue({ login });
  });

  it('renders nothing while not visible', () => {
    render(<DownloadSignInDialog visible={false} onClose={onClose} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('asks to log in, as the legacy platform did: no title bar, Cancel and Log in, closed by a click outside', () => {
    render(<DownloadSignInDialog visible={true} onClose={onClose} />);

    const dialog = screen.getByTestId('mock-dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Please log in to download.');
    expect(dialog).toHaveAttribute('data-header', 'none');
    expect(dialog).toHaveAttribute('data-close-on-overlay', 'true');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Please log in to download.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('closes without logging in on Cancel', () => {
    render(<DownloadSignInDialog visible={true} returnTo="/download?filterId=f" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(login).not.toHaveBeenCalled();
  });

  it('closes and logs in, coming back to returnTo, on Log in', () => {
    render(<DownloadSignInDialog visible={true} returnTo="/download?filterId=f" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith('/download?filterId=f');
  });

  it('logs in coming back to the current page without returnTo', () => {
    render(<DownloadSignInDialog visible={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(login).toHaveBeenCalledWith(undefined);
  });
});
