import { render, screen, fireEvent } from '@testing-library/react';
import { InfoDialog } from 'components/UI/InfoDialog/InfoDialog';
import { useDialogDismiss } from 'hooks/useDialogDismiss';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('hooks/useDialogDismiss');

jest.mock('components/UI/Dialog/Dialog', () => ({
  Dialog: ({ visible, children, onContinue, onCancel }: any) => {
    const MockDialog = () =>
      visible ? (
        <div data-testid="mock-dialog">
          {children}
          <button data-testid="continue-btn" onClick={onContinue}>
            Continue
          </button>
          <button data-testid="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : null;
    MockDialog.displayName = 'MockDialog';
    return <MockDialog />;
  },
}));

const mockDismissPermanently = jest.fn();

const STORAGE_KEY = 'test-key';

const defaultProps = {
  isVisible: true,
  storageKey: STORAGE_KEY,
  header: 'Test header',
  message: 'Test message',
  onContinue: jest.fn(),
  onCancel: jest.fn(),
};

describe('InfoDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useDialogDismiss as jest.Mock).mockReturnValue({
      isDismissed: false,
      dismissPermanently: mockDismissPermanently,
    });
  });

  it('shows the dialog when isVisible is true and not dismissed', () => {
    render(<InfoDialog {...defaultProps} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('does not show the dialog when already dismissed in localStorage', () => {
    (useDialogDismiss as jest.Mock).mockReturnValue({
      isDismissed: true,
      dismissPermanently: mockDismissPermanently,
    });
    render(<InfoDialog {...defaultProps} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('calls dismissPermanently and onContinue when dont-show-again is checked and Continue is clicked', () => {
    const onContinue = jest.fn();
    render(<InfoDialog {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByTestId('sh-ui-checkbox'));
    fireEvent.click(screen.getByTestId('continue-btn'));

    expect(mockDismissPermanently).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
