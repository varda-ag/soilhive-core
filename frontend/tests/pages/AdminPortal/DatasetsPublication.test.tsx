import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsPublication } from '../../../src/pages/AdminPortal/DatasetsPublication/DatasetsPublication';
import { useDatasetsPublicationList } from 'hooks/useDatasetsPublicationList';

jest.mock('hooks/useDatasetsPublicationList', () => ({
  useDatasetsPublicationList: jest.fn(),
}));

jest.mock('components/AdminPortal/DatasetsPublicationTable/DatasetsPublicationTable', () => ({
  DatasetsPublicationTable: ({ datasets, onEdit, onDelete, onPublish }: any) => (
    <div data-testid="mock-publication-table" data-count={datasets.length}>
      <button data-testid="btn-edit" onClick={() => onEdit('dataset-1')} />
      <button data-testid="btn-delete" onClick={() => onDelete({ id: 'dataset-1', name: 'Dataset One' })} />
      <button data-testid="btn-publish" onClick={() => onPublish('dataset-1')} />
    </div>
  ),
}));

jest.mock('components/AdminPortal/DatasetDeleteModal/DatasetDeleteModal', () => ({
  DatasetDeleteModal: ({ visible, datasetName, onContinue, onCancel }: any) =>
    visible ? (
      <div data-testid="mock-delete-modal">
        <span>{datasetName}</span>
        <button data-testid="btn-confirm" onClick={onContinue} />
        <button data-testid="btn-cancel" onClick={onCancel} />
      </div>
    ) : null,
}));

jest.mock('components/AdminPortal/DatasetErrorModal/DatasetErrorModal', () => ({
  DatasetErrorModal: () => null,
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: any) => (
    <button data-testid="sh-ui-button" onClick={onClick}>
      {children}
    </button>
  ),
  Loader: () => <div data-testid="mock-loader" />,
  TextInput: ({ value, onChange }: any) => <input data-testid="mock-search-input" value={value} onChange={e => onChange(e.target.value)} />,
}));

const baseHookValue = {
  isLoading: false,
  filteredDatasets: [{ id: 'dataset-1', name: 'Dataset One' }],
  searchValue: '',
  selectedDataset: null,
  isDeleteModalOpened: false,
  isErrorModalOpened: false,
  selectedErrorDataset: null,
  errorsForSelectedDataset: [],
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onPublish: jest.fn(),
  onShowErrors: jest.fn(),
  onDeletionConfirm: jest.fn(),
  onDeleteModalClose: jest.fn(),
  onErrorModalClose: jest.fn(),
  setSearchValue: jest.fn(),
  navigateToNewDataset: jest.fn(),
};

describe('DatasetsPublication page', () => {
  beforeEach(() => {
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows Loader when isLoading is true', () => {
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue, isLoading: true });

    render(<DatasetsPublication />);

    expect(screen.getByTestId('mock-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-publication-table')).not.toBeInTheDocument();
  });

  it('shows content when isLoading is false', () => {
    render(<DatasetsPublication />);

    expect(screen.queryByTestId('mock-loader')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-publication-table')).toBeInTheDocument();
    expect(screen.getByTestId('mock-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-button')).toBeInTheDocument();
  });

  it('passes filteredDatasets to the table', () => {
    render(<DatasetsPublication />);

    expect(screen.getByTestId('mock-publication-table')).toHaveAttribute('data-count', '1');
  });

  it('calls setSearchValue when search input changes', () => {
    const setSearchValue = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue, setSearchValue });

    render(<DatasetsPublication />);

    fireEvent.change(screen.getByTestId('mock-search-input'), { target: { value: 'test' } });

    expect(setSearchValue).toHaveBeenCalledWith('test');
  });

  it('calls navigateToNewDataset when add button is clicked', () => {
    const navigateToNewDataset = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue, navigateToNewDataset });

    render(<DatasetsPublication />);

    fireEvent.click(screen.getByTestId('sh-ui-button'));

    expect(navigateToNewDataset).toHaveBeenCalledTimes(1);
  });

  it('calls onEdit when edit is triggered from the table', () => {
    const onEdit = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue, onEdit });

    render(<DatasetsPublication />);

    fireEvent.click(screen.getByTestId('btn-edit'));

    expect(onEdit).toHaveBeenCalledWith('dataset-1');
  });

  it('calls onDelete when delete is triggered from the table', () => {
    const onDelete = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue, onDelete });

    render(<DatasetsPublication />);

    fireEvent.click(screen.getByTestId('btn-delete'));

    expect(onDelete).toHaveBeenCalledWith({ id: 'dataset-1', name: 'Dataset One' });
  });

  it('calls onPublish when publish is triggered from the table', () => {
    const onPublish = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({ ...baseHookValue, onPublish });

    render(<DatasetsPublication />);

    fireEvent.click(screen.getByTestId('btn-publish'));

    expect(onPublish).toHaveBeenCalledWith('dataset-1');
  });

  it('does not render delete modal when isDeleteModalOpened is false', () => {
    render(<DatasetsPublication />);

    expect(screen.queryByTestId('mock-delete-modal')).not.toBeInTheDocument();
  });

  it('renders delete modal with dataset name when isDeleteModalOpened is true', () => {
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({
      ...baseHookValue,
      isDeleteModalOpened: true,
      selectedDataset: { id: 'dataset-1', name: 'Dataset One' },
    });

    render(<DatasetsPublication />);

    expect(screen.getByTestId('mock-delete-modal')).toBeInTheDocument();
    expect(screen.getByText('Dataset One')).toBeInTheDocument();
  });

  it('calls onDeletionConfirm when confirm button is clicked in modal', () => {
    const onDeletionConfirm = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({
      ...baseHookValue,
      isDeleteModalOpened: true,
      selectedDataset: { id: 'dataset-1', name: 'Dataset One' },
      onDeletionConfirm,
    });

    render(<DatasetsPublication />);

    fireEvent.click(screen.getByTestId('btn-confirm'));

    expect(onDeletionConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteModalClose when cancel button is clicked in modal', () => {
    const onDeleteModalClose = jest.fn();
    (useDatasetsPublicationList as jest.Mock).mockReturnValue({
      ...baseHookValue,
      isDeleteModalOpened: true,
      selectedDataset: { id: 'dataset-1', name: 'Dataset One' },
      onDeleteModalClose,
    });

    render(<DatasetsPublication />);

    fireEvent.click(screen.getByTestId('btn-cancel'));

    expect(onDeleteModalClose).toHaveBeenCalledTimes(1);
  });
});
