import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetErrorModal } from 'components/AdminPortal/DatasetErrorModal/DatasetErrorModal';
import { IngestionStatus } from 'types/backend';
import type { DatasetsPublicationListItem } from 'types/datasetsPublication';
import type { DatasetErrorItem } from 'types/datasetErrors';

jest.mock('components/UI', () => ({
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
  { code: 'FTD_FILE_NOT_FOUND', message: 'Your file was removed from storage.', action: 'Re-upload the file.', params: {} },
  { code: 'BL_RAW_TABLE_NOT_FOUND', message: 'Files not staged yet.', action: 'Check file status.', params: {} },
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

  it('renders suggested fix actions as bullets', () => {
    render(<DatasetErrorModal {...defaultProps} />);

    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Re-upload the file.');
    expect(screen.getByTestId('dialog-content')).toHaveTextContent('Check file status.');
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
});
