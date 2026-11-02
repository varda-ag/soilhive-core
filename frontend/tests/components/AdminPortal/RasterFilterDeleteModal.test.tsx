import { render, screen, fireEvent } from '@testing-library/react';
import { RasterFilterDeleteModal } from 'components/AdminPortal/RasterFilterDeleteModal/RasterFilterDeleteModal';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  // The real useTranslation warns when no i18next instance is initialised
  useTranslation: () => ({ t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key) }),
  Trans: ({ i18nKey, values }: any) => (
    <span data-testid="trans" data-i18n-key={i18nKey}>
      {values?.filterName}
    </span>
  ),
}));

jest.mock('components/Dialog/Dialog', () => ({
  Dialog: ({ visible, header, secondaryText, primaryText, onPrimary, onSecondary, children }: any) =>
    visible ? (
      <div data-testid="mock-dialog">
        <span data-testid="dialog-header">{header}</span>
        <div data-testid="dialog-content">{children}</div>
        <button data-testid="btn-cancel" onClick={onSecondary}>
          {secondaryText}
        </button>
        <button data-testid="btn-continue" onClick={onPrimary}>
          {primaryText}
        </button>
      </div>
    ) : null,
}));

describe('RasterFilterDeleteModal', () => {
  const defaultProps = {
    visible: true,
    filterName: 'Land Cover 2024',
    onContinue: jest.fn(),
    onCancel: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when visible is false', () => {
    render(<RasterFilterDeleteModal {...defaultProps} visible={false} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when visible is true', () => {
    render(<RasterFilterDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('renders the translated title', () => {
    render(<RasterFilterDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-header')).toHaveTextContent('filters.list.delete_modal.title');
  });

  it('renders the translated cancel and confirm button texts', () => {
    render(<RasterFilterDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('btn-cancel')).toHaveTextContent('filters.list.delete_modal.cancel');
    expect(screen.getByTestId('btn-continue')).toHaveTextContent('filters.list.delete_modal.confirm');
  });

  it('renders the delete message with the filter name', () => {
    render(<RasterFilterDeleteModal {...defaultProps} />);

    expect(screen.getByTestId('trans')).toHaveAttribute('data-i18n-key', 'filters.list.delete_modal.message');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Land Cover 2024');
  });

  it('renders without crashing when filterName is undefined', () => {
    render(<RasterFilterDeleteModal {...defaultProps} filterName={undefined} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('calls onContinue when the confirm button is clicked', () => {
    const onContinue = jest.fn();
    render(<RasterFilterDeleteModal {...defaultProps} onContinue={onContinue} />);

    fireEvent.click(screen.getByTestId('btn-continue'));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(<RasterFilterDeleteModal {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId('btn-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(defaultProps.onContinue).not.toHaveBeenCalled();
  });
});
