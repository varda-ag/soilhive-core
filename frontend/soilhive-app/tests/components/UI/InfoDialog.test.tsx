import { render, screen, fireEvent } from '@testing-library/react';
import { InfoDialog } from 'components/UI/InfoDialog/InfoDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

const STORAGE_KEY = 'test-key';
const STORAGE_FULL_KEY = `info-dialog-dismissed:${STORAGE_KEY}`;

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
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('shows the dialog when isVisible is true and not dismissed', () => {
    render(<InfoDialog {...defaultProps} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('does not show the dialog when already dismissed in localStorage', () => {
    localStorage.setItem(STORAGE_FULL_KEY, 'true');
    render(<InfoDialog {...defaultProps} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('persists dismissal to localStorage and calls onContinue when dont-show-again is checked', () => {
    const onContinue = jest.fn();
    render(<InfoDialog {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByTestId('sh-ui-checkbox'));
    fireEvent.click(screen.getByTestId('continue-btn'));

    expect(localStorage.getItem(STORAGE_FULL_KEY)).toBe('true');
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
