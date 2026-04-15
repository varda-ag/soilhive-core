import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetDeleteModal } from 'components/AdminPortal/DatasetDeleteModal/DatasetDeleteModal';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  Trans: ({ values }: any) => <span>{values?.datasetName}</span>,
}));

jest.mock('components/UI', () => ({
  Dialog: ({ visible, header, cancelText, continueText, onContinue, onCancel, children }: any) =>
    visible ? (
      <div data-testid="mock-dialog">
        <span data-testid="dialog-header">{header}</span>
        <div data-testid="dialog-content">{children}</div>
        <button data-testid="btn-cancel" onClick={onCancel}>
          {cancelText}
        </button>
        <button data-testid="btn-continue" onClick={onContinue}>
          {continueText}
        </button>
      </div>
    ) : null,
}));

describe('DatasetDeleteModal', () => {
  const defaultProps = {
    visible: true,
    datasetName: 'Carbon Dataset',
    onContinue: jest.fn(),
    onCancel: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when visible is false', () => {
    render(<DatasetDeleteModal {...defaultProps} visible={false} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when visible is true', () => {
    render(<DatasetDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('renders the translated title', () => {
    render(<DatasetDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-header')).toHaveTextContent('datasets.list.delete_modal.title');
  });

  it('renders the translated cancel and confirm button texts', () => {
    render(<DatasetDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('btn-cancel')).toHaveTextContent('datasets.list.delete_modal.cancel');
    expect(screen.getByTestId('btn-continue')).toHaveTextContent('datasets.list.delete_modal.confirm');
  });

  it('renders the dataset name in the message', () => {
    render(<DatasetDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Carbon Dataset');
  });

  it('renders without crashing when datasetName is undefined', () => {
    render(<DatasetDeleteModal {...defaultProps} datasetName={undefined} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('calls onContinue when confirm button is clicked', () => {
    const onContinue = jest.fn();
    render(<DatasetDeleteModal {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByTestId('btn-continue'));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(<DatasetDeleteModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('btn-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
