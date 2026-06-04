import { render, screen, fireEvent } from '@testing-library/react';
import { LeaveIngestionModal } from 'components/AdminPortal/LeaveIngestionModal/LeaveIngestionModal';

jest.mock('components/UI', () => ({
  Dialog: ({ visible, header, secondaryText, primaryText, onPrimary, onSecondary, onClose, children }: any) =>
    visible ? (
      <div data-testid="mock-dialog">
        <span data-testid="dialog-header">{header}</span>
        <div data-testid="dialog-content">{children}</div>
        <button data-testid="btn-secondary" onClick={onSecondary}>
          {secondaryText}
        </button>
        <button data-testid="btn-primary" onClick={onPrimary}>
          {primaryText}
        </button>
        <button data-testid="btn-close" onClick={onClose} />
      </div>
    ) : null,
}));

describe('LeaveIngestionModal', () => {
  const defaultProps = {
    visible: true,
    onContinue: jest.fn(),
    onCancel: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when visible is false', () => {
    render(<LeaveIngestionModal {...defaultProps} visible={false} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when visible is true', () => {
    render(<LeaveIngestionModal {...defaultProps} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('renders the translated title', () => {
    render(<LeaveIngestionModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-header')).toHaveTextContent('Leave this process?');
  });

  it('renders the translated button texts', () => {
    render(<LeaveIngestionModal {...defaultProps} />);

    expect(screen.getByTestId('btn-secondary')).toHaveTextContent('Leave and save progress');
    expect(screen.getByTestId('btn-primary')).toHaveTextContent('Stay here');
  });

  it('renders the translated message', () => {
    render(<LeaveIngestionModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent(
      'Your progress will be saved. You can return later and continue editing from the datasets list.',
    );
  });

  it('calls onContinue when the confirm (secondary) button is clicked', () => {
    const onContinue = jest.fn();
    render(<LeaveIngestionModal {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByTestId('btn-secondary'));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel (primary) button is clicked', () => {
    const onCancel = jest.fn();
    render(<LeaveIngestionModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('btn-primary'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the dialog is closed via the close button', () => {
    const onCancel = jest.fn();
    render(<LeaveIngestionModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('btn-close'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onContinue when onCancel is triggered', () => {
    const onContinue = jest.fn();
    const onCancel = jest.fn();
    render(<LeaveIngestionModal {...defaultProps} onContinue={onContinue} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('btn-primary'));

    expect(onContinue).not.toHaveBeenCalled();
  });

  it('does not call onCancel when onContinue is triggered', () => {
    const onContinue = jest.fn();
    const onCancel = jest.fn();
    render(<LeaveIngestionModal {...defaultProps} onContinue={onContinue} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('btn-secondary'));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
