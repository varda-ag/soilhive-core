import { render, screen, fireEvent } from '@testing-library/react';
import { SoilDataFileRow } from '../../src/pages/AdminPortal/DatasetsSoilDataStep/SoilDataFileRow/SoilDataFileRow';

// Mock the Button component if it has complex internal logic
jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick} data-testid="remove-button">
      {children}
    </button>
  ),
}));

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

    const removeBtn = screen.getByTestId('remove-button');
    fireEvent.click(removeBtn);

    expect(onRemove).toHaveBeenCalledWith('file-123');
  });
});
