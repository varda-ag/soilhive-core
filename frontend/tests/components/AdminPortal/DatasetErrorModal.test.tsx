import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetErrorModal } from 'components/AdminPortal/DatasetErrorModal/DatasetErrorModal';
import { IngestionStatus } from 'types/backend';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import { UNEXPECTED_JOB_ERROR_CODE, type DatasetErrorItem } from 'types/datasetErrors';

jest.mock('components/Dialog/Dialog', () => ({
  Dialog: ({ visible, primaryText, onPrimary, children }: any) =>
    visible ? (
      <div data-testid="mock-dialog">
        <div data-testid="dialog-content">{children}</div>
        <button data-testid="btn-close" onClick={onPrimary}>
          {primaryText}
        </button>
      </div>
    ) : null,
}));

const dataset: DatasetsPublicationListItem = {
  id: '1',
  name: 'Global Soil Dataset',
  status: IngestionStatus.PENDING,
  updated_at: new Date('2026-05-29'),
  visibility: 'public',
};

const errors: DatasetErrorItem[] = [
  { code: 'FTD_FILE_NOT_FOUND', message: 'Your file was removed from storage.', actions: ['Re-upload the file.'], params: {} },
  { code: 'BL_RAW_TABLE_NOT_FOUND', message: 'Files not staged yet.', actions: ['Check file status.', 'Contact support.'], params: {} },
];

const defaultProps = {
  visible: true,
  dataset,
  errors,
  onClose: jest.fn(),
};

describe('DatasetErrorModal', () => {
  afterEach(() => jest.clearAllMocks());

  it('does not render when visible is false', () => {
    render(<DatasetErrorModal {...defaultProps} visible={false} />);

    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('renders when visible is true', () => {
    render(<DatasetErrorModal {...defaultProps} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('renders the dataset name', () => {
    render(<DatasetErrorModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Global Soil Dataset');
  });

  it('renders each error message', () => {
    render(<DatasetErrorModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Your file was removed from storage.');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Files not staged yet.');
  });

  it('renders all suggested fix actions flattened across errors', () => {
    render(<DatasetErrorModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Re-upload the file.');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Check file status.');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Contact support.');
  });

  it('does not render suggested fixes section when there are no errors', () => {
    render(<DatasetErrorModal {...defaultProps} errors={[]} />);

    expect(screen.queryByText('Suggested fix/es')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();
    render(<DatasetErrorModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('btn-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when dataset is null', () => {
    render(<DatasetErrorModal {...defaultProps} dataset={null} />);

    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  describe('unexpected error detail', () => {
    // UNEXPECTED_ERROR's message is the generic fallback, so without the detail the modal said
    // nothing at all about what actually failed.
    const unexpected: DatasetErrorItem = {
      code: UNEXPECTED_JOB_ERROR_CODE,
      message: 'An unexpected error occurred during processing.',
      actions: ['Try again. If the problem persists, contact support.'],
      params: {},
      detail: 'violates check constraint "chk_raster_layers_date_format_start"',
    };

    it('renders the raw detail alongside the fallback message', () => {
      render(<DatasetErrorModal {...defaultProps} errors={[unexpected]} />);

      expect(screen.getByTestId('dialog-content')).toHaveTextContent('An unexpected error occurred during processing.');
      expect(screen.getByTestId('dialog-content')).toHaveTextContent('violates check constraint "chk_raster_layers_date_format_start"');
      expect(screen.getByText('Technical detail:')).toBeInTheDocument();
    });

    it('omits the detail line when an unexpected error carries none', () => {
      render(<DatasetErrorModal {...defaultProps} errors={[{ ...unexpected, detail: undefined }]} />);

      expect(screen.getByTestId('dialog-content')).toHaveTextContent('An unexpected error occurred during processing.');
      expect(screen.queryByText('Technical detail:')).not.toBeInTheDocument();
    });

    // A mapped code already spells the cause out in its own message; its detail is supplementary
    // and belongs in the message, not in a raw technical line.
    it('does not render the detail for a translated error code', () => {
      const translated: DatasetErrorItem = {
        code: 'RL_INVALID_BAND',
        message: "The band mapping for 'soil.tif' refers to band 5, which the file does not have (it has 2).",
        actions: [],
        params: {},
        detail: 'the file has 2',
      };
      render(<DatasetErrorModal {...defaultProps} errors={[translated]} />);

      expect(screen.queryByText('Technical detail:')).not.toBeInTheDocument();
      expect(screen.getByTestId('dialog-content')).not.toHaveTextContent('the file has 2');
    });

    it('shows the detail only for the unexpected error when errors are mixed', () => {
      render(<DatasetErrorModal {...defaultProps} errors={[errors[0], unexpected]} />);

      expect(screen.getByTestId('dialog-content')).toHaveTextContent('Your file was removed from storage.');
      expect(screen.getAllByText('Technical detail:')).toHaveLength(1);
    });
  });
});
