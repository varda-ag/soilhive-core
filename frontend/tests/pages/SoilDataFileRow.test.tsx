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

  it('renders a previously selected "EPSG:<code> - <name>" value in the input', () => {
    const fileWithNamedCrs = { ...mockFile, crs: 'EPSG:3857 - WGS 84 / Pseudo-Mercator' };

    render(<SoilDataFileRow soilDataFile={fileWithNamedCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    expect(screen.getByRole('combobox')).toHaveValue('EPSG:3857 - WGS 84 / Pseudo-Mercator');
  });

  it('does not reset a valid "EPSG:<code> - <name>" crs value on blur', () => {
    const fileWithNamedCrs = { ...mockFile, crs: 'EPSG:3857 - WGS 84 / Pseudo-Mercator', inferredCrs: undefined };

    render(<SoilDataFileRow soilDataFile={fileWithNamedCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    fireEvent.blur(screen.getByRole('combobox'));

    expect(onCrsChange).not.toHaveBeenCalled();
  });

  it('clears a half-typed crs on blur, leaving the detected one to show through', () => {
    const fileWithInferred = { ...mockFile, crs: 'INVALID', inferredCrs: 'EPSG:4326' };

    render(<SoilDataFileRow soilDataFile={fileWithInferred} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

    const input = screen.getByRole('combobox');
    fireEvent.blur(input);

    // Cleared rather than overwritten with the detected value: `crs` records a user choice, and
    // the field falls back to the detected CRS on its own.
    expect(onCrsChange).toHaveBeenCalledWith('file-123', '');
  });

  describe('detected CRS', () => {
    // The three states the upload step can be in, as the file metadata reports them.
    const rasterWithEpsg = { ...mockFile, name: 'a.tif', crs: null, isRaster: true, inferredCrs: 'EPSG:3857', hasCustomCrs: false };
    const rasterWithCustomCrs = { ...mockFile, name: 'a.tif', crs: null, isRaster: true, inferredCrs: undefined, hasCustomCrs: true };
    const rasterWithNoCrs = { ...mockFile, name: 'a.tif', crs: null, isRaster: true, inferredCrs: undefined, hasCustomCrs: false };

    it('pre-selects the detected EPSG as its full list entry and locks the field', () => {
      render(<SoilDataFileRow soilDataFile={rasterWithEpsg} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

      // The bare code is what detection yields; the row shows the entry it belongs to so the
      // field reads as a selection. Locked because the file already declares it — correcting a
      // wrong one means correcting the file.
      expect(screen.getByRole('combobox')).toHaveValue('EPSG:3857 - WGS 84 / Pseudo-Mercator');
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('falls back to the bare code when the detected EPSG is not in the list', () => {
      const unlisted = { ...rasterWithEpsg, inferredCrs: 'EPSG:99999' };

      render(<SoilDataFileRow soilDataFile={unlisted} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

      expect(screen.getByRole('combobox')).toHaveValue('EPSG:99999');
    });

    it('shows the custom-CRS message and disables the field for a raster with no EPSG code', () => {
      render(
        <SoilDataFileRow soilDataFile={rasterWithCustomCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />,
      );

      expect(screen.getByRole('combobox')).toHaveValue('datasets.soil_data.crs_custom_detected');
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('leaves the field empty and editable for a raster that declares no CRS', () => {
      render(<SoilDataFileRow soilDataFile={rasterWithNoCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />);

      expect(screen.getByRole('combobox')).toHaveValue('');
      expect(screen.getByRole('combobox')).not.toBeDisabled();
      expect(screen.getByLabelText('datasets.soil_data.crs_label')).toBe(screen.getByRole('combobox'));
    });

    // Vector staging passes the EPSG code to ogr2ogr and assumes WGS 84 without one, so a custom
    // CRS is not enough there and the field must stay open for the user to supply a code.
    it('does not lock the field for a vector file on a custom CRS', () => {
      const vectorWithCustomCrs = { ...mockFile, crs: null, isRaster: false, inferredCrs: undefined, hasCustomCrs: true };

      render(
        <SoilDataFileRow soilDataFile={vectorWithCustomCrs} onCrsChange={onCrsChange} onRemove={onRemove} crsOptions={mockCrsOptions} />,
      );

      expect(screen.getByRole('combobox')).not.toBeDisabled();
      expect(screen.getByRole('combobox')).toHaveValue('');
    });
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
