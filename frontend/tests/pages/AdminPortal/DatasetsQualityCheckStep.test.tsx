import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsSoilDataStep } from '../../../src/pages/AdminPortal/DatasetsSoilDataStep/DatasetsSoilDataStep';
import { useDatasetsSoilData } from 'hooks/useDatasetsSoilData';

// Mock the custom hook
jest.mock('hooks/useDatasetsSoilData', () => ({
  useDatasetsSoilData: jest.fn(),
  ALLOWED_EXTENSIONS: ['.csv', '.xlsx'],
}));

// Mock the sub-component to avoid deep rendering issues in unit tests
jest.mock('../../../src/pages/AdminPortal/DatasetsSoilDataStep/SoilDataFileRow/SoilDataFileRow', () => ({
  SoilDataFileRow: ({ soilDataFile, onRemove }: any) => (
    <div data-testid="soil-file-row">
      {soilDataFile.id}
      <button onClick={onRemove} data-testid={`remove-${soilDataFile.id}`}>
        Remove
      </button>
    </div>
  ),
}));

const mockCrsOptions = [{ value: '4326', label: 'EPSG:4326' }];

const baseHookValues = {
  fileInputRef: { current: null },
  soilDataFiles: [],
  uploadingFiles: [],
  uploadErrors: null,
  uploadProgress: {},
  isContinueEnabled: true,
  handleFiles: jest.fn(),
  handleCrsChange: jest.fn(),
  removeFile: jest.fn(),
  clearAll: jest.fn(),
  handlePrevious: jest.fn(),
  handleSaveAndContinueLater: jest.fn(),
  handleContinue: jest.fn(),
  crsOptions: mockCrsOptions,
};

describe('DatasetsSoilDataStep', () => {
  beforeEach(() => {
    (useDatasetsSoilData as jest.Mock).mockReturnValue(baseHookValues);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly and matches snapshot', () => {
    const { container } = render(<DatasetsSoilDataStep />);
    expect(container).toMatchSnapshot();
  });

  it('calls handleContinue when the continue button is clicked', () => {
    render(<DatasetsSoilDataStep />);

    const continueBtn = screen.getByRole('button', { name: /^continue$/i });
    fireEvent.click(continueBtn);

    expect(baseHookValues.handleContinue).toHaveBeenCalled();
  });

  it('disables the continue button when isContinueEnabled is false', () => {
    (useDatasetsSoilData as jest.Mock).mockReturnValue({
      ...baseHookValues,
      isContinueEnabled: false,
    });

    render(<DatasetsSoilDataStep />);
    const continueBtn = screen.getByRole('button', { name: /^continue$/i });

    expect(continueBtn).toBeDisabled();
  });

  it('renders the list of uploaded files and triggers removeFile', () => {
    const mockFiles = [
      { id: '1', name: 'soil1.csv' },
      { id: '2', name: 'soil2.csv' },
    ];

    (useDatasetsSoilData as jest.Mock).mockReturnValue({
      ...baseHookValues,
      soilDataFiles: mockFiles,
    });

    render(<DatasetsSoilDataStep />);

    // Check if the file count text is rendered
    expect(screen.getByText(/files uploaded/i)).toBeInTheDocument();

    // Check if the correct number of rows are rendered
    const rows = screen.getAllByTestId('soil-file-row');
    expect(rows).toHaveLength(2);

    // Trigger remove for the first file
    const removeBtn = screen.getByTestId('remove-1');
    fireEvent.click(removeBtn);

    expect(baseHookValues.removeFile).toHaveBeenCalledWith('1');
  });

  it('calls clearAll when the clear all button is clicked', () => {
    (useDatasetsSoilData as jest.Mock).mockReturnValue({
      ...baseHookValues,
      soilDataFiles: [{ id: '1', name: 'soil1.csv' }],
    });

    render(<DatasetsSoilDataStep />);

    const clearBtn = screen.getByRole('button', { name: /clear all/i });
    fireEvent.click(clearBtn);

    expect(baseHookValues.clearAll).toHaveBeenCalled();
  });
});
