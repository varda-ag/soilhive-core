import { render, screen, fireEvent } from '@testing-library/react';
import { SoilDataFileRow } from '../../src/pages/AdminPortal/DatasetsSoilDataStep/SoilDataFileRow/SoilDataFileRow';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('components/UI', () => ({
  Button: ({ children, onClick, dataTestId }: any) => (
    <button onClick={onClick} data-testid={dataTestId ?? 'sh-ui-button'}>
      {children}
    </button>
  ),
  FormMessage: ({ message }: any) => <div data-testid="sh-form-message">{message}</div>,
}));

jest.mock('components/Dialog/Dialog', () => ({
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

const mockCrsOptions = [
  { code: 4326, name: 'WGS 84' },
  { code: 3857, name: 'WGS 84 / Pseudo-Mercator' },
  { code: 25832, name: 'ETRS89 / UTM zone 32N' },
];

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

  it('renders the read-only CRS label when an inferredCrs exists', () => {
    const readOnlyFile = { ...mockFile, inferredCrs: 'EPSG:4326' };

    render(<SoilDataFileRow soilDataFile={readOnlyFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByLabelText('datasets.soil_data.crs_label_readonly')).toBe(screen.getByRole('combobox'));
    expect(screen.queryByText('datasets.soil_data.crs_label')).not.toBeInTheDocument();
  });

  it('renders the editable CRS label when no inferredCrs exists', () => {
    render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByLabelText('datasets.soil_data.crs_label')).toBe(screen.getByRole('combobox'));
    expect(screen.queryByText('datasets.soil_data.crs_label_readonly')).not.toBeInTheDocument();
  });

  it('calls onCrsChange when the user types in the autocomplete', () => {
    render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'EPSG:3857' } });

    expect(onCrsChange).toHaveBeenCalledWith('file-123', 'EPSG:3857');
  });

  it('renders a previously selected "EPSG:<code> — <name>" value in the input', () => {
    const fileWithNamedCrs = { ...mockFile, crs: 'EPSG:3857 — WGS 84 / Pseudo-Mercator' };

    render(<SoilDataFileRow soilDataFile={fileWithNamedCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByRole('combobox')).toHaveValue('EPSG:3857 — WGS 84 / Pseudo-Mercator');
  });

  it('does not reset a valid "EPSG:<code> — <name>" crs value on blur', () => {
    const fileWithNamedCrs = { ...mockFile, crs: 'EPSG:3857 — WGS 84 / Pseudo-Mercator', inferredCrs: undefined };

    render(<SoilDataFileRow soilDataFile={fileWithNamedCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    fireEvent.blur(screen.getByRole('combobox'));

    expect(onCrsChange).not.toHaveBeenCalled();
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

  describe('CRS panel width', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('does not apply an explicit panel width when a 2D canvas context is unavailable (e.g. in jsdom)', () => {
      render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

      fireEvent.focus(screen.getByRole('combobox'));

      const panel = document.querySelector('.p-autocomplete-panel') as HTMLElement;
      expect(panel).toBeInTheDocument();
      expect(panel.style.width).toBe('');
    });

    it('sizes the panel to the longest "EPSG:<code> - <name>" option, measuring only that one', () => {
      const measureText = jest.fn((text: string) => ({ width: text.length * 10 }) as TextMetrics);
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText, font: '' } as any);

      render(<SoilDataFileRow soilDataFile={mockFile} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);
      fireEvent.focus(screen.getByRole('combobox'));

      const longestOption = 'EPSG:3857 - WGS 84 / Pseudo-Mercator';
      expect(measureText).toHaveBeenCalledTimes(1);
      expect(measureText).toHaveBeenCalledWith(longestOption);

      const panel = document.querySelector('.p-autocomplete-panel') as HTMLElement;
      expect(panel.style.width).toBe(`${longestOption.length * 10 + 32}px`);
    });
  });
});
