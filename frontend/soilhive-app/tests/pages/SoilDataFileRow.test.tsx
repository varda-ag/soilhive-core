import { render, screen, fireEvent } from '@testing-library/react';
import { SoilDataFileRow } from '../../src/pages/AdminPortal/DatasetsSoilDataStep/SoilDataFileRow/SoilDataFileRow';

jest.mock('components/UI', () => ({
  Button: ({ children, onClick, dataTestId }: any) => (
    <button onClick={onClick} data-testid={dataTestId ?? 'sh-ui-button'}>
      {children}
    </button>
  ),
  FormMessage: ({ message }: any) => <div data-testid="sh-form-message">{message}</div>,
  Dialog: ({ visible, header, children, onPrimary }: any) =>
    visible ? (
      <div data-testid="sh-dialog">
        <div data-testid="sh-dialog-header">{header}</div>
        <div>{children}</div>
        <button onClick={onPrimary} data-testid="sh-dialog-close">
          Close
        </button>
      </div>
    ) : null,
}));

jest.mock('assets/icons/question-round-icon.svg?react', () => {
  const Mock = () => <div data-testid="sh-question-icon" />;
  Mock.displayName = 'Mock';
  return Mock;
});

const mockFile = {
  id: 'file-123',
  name: 'test-soil-data.csv',
  file: { size: 1048576 } as File, // 1.0 Mb
  crs: 'EPSG:4326',
  inferredCrs: undefined,
  progress: 100,
};

const mockCrsOptions = [4326, 3857, 25832];

describe('SoilDataFileRow', () => {
  const onCrsChange = jest.fn();
  const onRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders file name and formatted file size correctly', () => {
    render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByText('test-soil-data.csv')).toBeInTheDocument();
    expect(screen.getByText('1.0 Mb')).toBeInTheDocument();
  });

  it('disables the CRS input when an inferredCrs exists (read-only mode)', () => {
    const readOnlyFile = { ...mockFile, inferredCrs: 'EPSG:4326' };

    render(<SoilDataFileRow soilDataFile={readOnlyFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    const input = screen.getByRole('combobox');
    expect(input).toBeDisabled();
  });

  it('calls onCrsChange when the user types in the autocomplete', () => {
    render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'EPSG:3857' } });

    expect(onCrsChange).toHaveBeenCalledWith('file-123', 'EPSG:3857');
  });

  it('resets to inferredCrs on blur if the entered value is invalid', () => {
    const fileWithInferred = { ...mockFile, crs: 'INVALID', inferredCrs: 'EPSG:4326' };

    render(<SoilDataFileRow soilDataFile={fileWithInferred} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    const input = screen.getByRole('combobox');
    fireEvent.blur(input);

    // Should call onCrsChange with the inferredCrs value to reset it
    expect(onCrsChange).toHaveBeenCalledWith('file-123', 'EPSG:4326');
  });

  it('calls onRemove when the cross button is clicked', () => {
    render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    const removeBtn = screen.getByTestId('sh-ui-button');
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith('file-123');
  });

  it('renders FormMessage when soilDataFile.error is set', () => {
    const fileWithError = { ...mockFile, error: 'This file has an incompatible structure with the first uploaded file.' };

    render(<SoilDataFileRow soilDataFile={fileWithError} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByTestId('sh-form-message')).toBeInTheDocument();
    expect(screen.getByText(/incompatible structure/)).toBeInTheDocument();
  });

  it('does not render FormMessage when soilDataFile.error is null', () => {
    const fileWithoutError = { ...mockFile, error: null };

    render(<SoilDataFileRow soilDataFile={fileWithoutError} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.queryByTestId('sh-form-message')).not.toBeInTheDocument();
  });

  it('renders the diff button when error is set', () => {
    const fileWithError = { ...mockFile, error: 'Inconsistent', missingFields: ['lat'], extraFields: [] };

    render(<SoilDataFileRow soilDataFile={fileWithError} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByTestId('sh-diff-button')).toBeInTheDocument();
  });

  it('does not render the diff button when error is null', () => {
    render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.queryByTestId('sh-diff-button')).not.toBeInTheDocument();
  });

  it('opens the diff dialog when the diff button is clicked', () => {
    const fileWithError = { ...mockFile, error: 'Inconsistent', missingFields: ['latitude'], extraFields: ['lat'] };

    render(<SoilDataFileRow soilDataFile={fileWithError} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);
    fireEvent.click(screen.getByTestId('sh-diff-button'));

    expect(screen.getByTestId('sh-dialog')).toBeInTheDocument();
  });

  it('shows missing fields in the dialog', () => {
    const fileWithError = { ...mockFile, error: 'Inconsistent', missingFields: ['latitude', 'longitude'], extraFields: [] };

    render(<SoilDataFileRow soilDataFile={fileWithError} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);
    fireEvent.click(screen.getByTestId('sh-diff-button'));

    expect(screen.getByText('latitude')).toBeInTheDocument();
    expect(screen.getByText('longitude')).toBeInTheDocument();
  });

  it('shows extra fields in the dialog', () => {
    const fileWithError = { ...mockFile, error: 'Inconsistent', missingFields: [], extraFields: ['lat', 'lon'] };

    render(<SoilDataFileRow soilDataFile={fileWithError} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);
    fireEvent.click(screen.getByTestId('sh-diff-button'));

    expect(screen.getByText('lat')).toBeInTheDocument();
    expect(screen.getByText('lon')).toBeInTheDocument();
  });
});
