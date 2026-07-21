import { render, screen, act } from '@testing-library/react';
import { UploadPolygonModal } from 'components/Map/UploadPolygonModal/UploadPolygonModal';
import { parseGeoJSONFile } from 'utilities/parseGeoJSONFile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <>{i18nKey}</>,
}));

jest.mock('utilities/parseGeoJSONFile', () => ({
  parseGeoJSONFile: jest.fn(),
}));

jest.mock('components/UI', () => ({
  Dialog: ({ visible, onClose, children, header }: any) => {
    if (!visible) return null;
    return (
      <div data-testid="dialog">
        <span data-testid="dialog-header">{header}</span>
        <button data-testid="dialog-close" onClick={onClose} />
        {children}
      </div>
    );
  },
  FileUploadBox: ({ handleFiles, errorMessage, fileInputRef }: any) => (
    <div data-testid="file-upload-box">
      <input ref={fileInputRef} data-testid="file-input" />
      <button data-testid="trigger-upload" onClick={() => handleFiles([new File(['{}'], 'test.geojson', { type: 'application/json' })])} />
      <button data-testid="trigger-empty-upload" onClick={() => handleFiles(null)} />
      {errorMessage && <span data-testid="upload-error">{errorMessage}</span>}
    </div>
  ),
}));

const parseGeoJSONFileMock = parseGeoJSONFile as jest.MockedFunction<typeof parseGeoJSONFile>;

describe('UploadPolygonModal', () => {
  const defaultProps = {
    visible: true,
    onUpload: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the component and matches the snapshot', () => {
    const { container } = render(<UploadPolygonModal {...defaultProps} />);

    expect(container).toMatchSnapshot();
  });

  it('does not render when visible is false', () => {
    render(<UploadPolygonModal {...defaultProps} visible={false} />);

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when the dialog close button is clicked', () => {
    const onClose = jest.fn();
    render(<UploadPolygonModal {...defaultProps} onClose={onClose} />);

    screen.getByTestId('dialog-close').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing when handleFiles is called with no file', async () => {
    render(<UploadPolygonModal {...defaultProps} />);

    await act(async () => {
      screen.getByTestId('trigger-empty-upload').click();
    });

    expect(parseGeoJSONFileMock).not.toHaveBeenCalled();
    expect(defaultProps.onUpload).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('shows an error message and does not call onUpload when parsing fails', async () => {
    parseGeoJSONFileMock.mockResolvedValue({
      error: { id: 'invalid-json', message: 'Not valid GeoJSON' },
    });

    render(<UploadPolygonModal {...defaultProps} />);

    await act(async () => {
      screen.getByTestId('trigger-upload').click();
    });

    expect(screen.getByTestId('upload-error')).toHaveTextContent('Not valid GeoJSON');
    expect(defaultProps.onUpload).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('clears the error message when a new upload starts', async () => {
    parseGeoJSONFileMock.mockResolvedValueOnce({
      error: { id: 'invalid-json', message: 'Not valid GeoJSON' },
    });

    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    parseGeoJSONFileMock.mockResolvedValueOnce({ polygon });

    render(<UploadPolygonModal {...defaultProps} />);

    await act(async () => {
      screen.getByTestId('trigger-upload').click();
    });
    expect(screen.getByTestId('upload-error')).toBeInTheDocument();

    await act(async () => {
      screen.getByTestId('trigger-upload').click();
    });
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
  });

  it('calls onUpload with the parsed polygon and onClose when parsing succeeds', async () => {
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    parseGeoJSONFileMock.mockResolvedValue({ polygon });

    const onUpload = jest.fn();
    const onClose = jest.fn();
    render(<UploadPolygonModal {...defaultProps} onUpload={onUpload} onClose={onClose} />);

    await act(async () => {
      screen.getByTestId('trigger-upload').click();
    });

    expect(onUpload).toHaveBeenCalledWith(polygon);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('upload-error')).not.toBeInTheDocument();
  });
});
