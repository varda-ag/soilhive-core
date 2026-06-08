import { render, screen, fireEvent } from '@testing-library/react';
import { useParams } from 'react-router';
import { LeaveIngestionModal } from 'components/AdminPortal/LeaveIngestionModal/LeaveIngestionModal';

jest.mock('react-router', () => ({
  useParams: jest.fn(),
}));

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

  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({});
  });

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

    expect(screen.getByTestId('btn-secondary')).toHaveTextContent('Leave without saving');
    expect(screen.getByTestId('btn-primary')).toHaveTextContent('Stay here');
  });

  it('renders the new-dataset message when no id is in the URL', () => {
    render(<LeaveIngestionModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('If you leave this process at this point, the progress won’t be saved.');
  });

  it('renders the existing-dataset message when id is present in the URL', () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'abc' });
    render(<LeaveIngestionModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('You can return later and continue editing from the datasets list.');
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
