import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CropModal } from 'components/CropModal/CropModal';
import { getCroppedFile } from '../../../src/utilities/cropper';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const dialogMock = jest.fn();
const cropperMock = jest.fn();
const rangeSliderMock = jest.fn();

jest.mock('components/UI', () => ({
  Dialog: (props: any) => {
    dialogMock(props);
    const { visible, header, children, onPrimary, onSecondary } = props;

    if (!visible) return null;

    return (
      <div data-testid="dialog">
        <div data-testid="dialog-header">{header}</div>
        <button data-testid="dialog-continue" onClick={onPrimary}>
          continue
        </button>
        <button data-testid="dialog-cancel" onClick={onSecondary}>
          cancel
        </button>
        {children}
      </div>
    );
  },
  Cropper: (props: any) => {
    cropperMock(props);
    return <div data-testid="cropper" />;
  },
  RangeSlider: (props: any) => {
    rangeSliderMock(props);
    return (
      <button data-testid="range-slider" onClick={() => props.onChange(2)}>
        range-slider
      </button>
    );
  },
}));

jest.mock('../../../src/utilities/cropper', () => ({
  getCroppedFile: jest.fn(),
}));

describe('CropModal', () => {
  const mockOnCrop = jest.fn();
  const mockOnCancel = jest.fn();
  const defaultProps = {
    isModalOpened: true,
    imageSrc: 'image-url',
    outputWidth: 133,
    outputHeight: 47,
    fileName: 'logo.png',
    headerText: 'Crop logo',
    secondaryText: 'Cancel',
    primaryText: 'Continue',
    onCrop: mockOnCrop,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dialog and matches snapshot', () => {
    const { container } = render(<CropModal {...defaultProps} />);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-header')).toHaveTextContent('Crop logo');
    expect(container).toMatchSnapshot();
  });

  it('renders cropper and range slider when imageSrc exists', () => {
    render(<CropModal {...defaultProps} />);

    expect(screen.getByTestId('cropper')).toBeInTheDocument();
    expect(screen.getByTestId('range-slider')).toBeInTheDocument();
    expect(screen.getByText('look_and_feel.logo.crop.zoom_label')).toBeInTheDocument();
  });

  it('does not render cropper content when imageSrc is null', () => {
    render(<CropModal {...defaultProps} imageSrc={null} />);

    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
    expect(screen.queryByTestId('range-slider')).not.toBeInTheDocument();
  });

  it('passes calculated aspect to cropper', () => {
    render(<CropModal {...defaultProps} outputHeight={50} outputWidth={200} />);

    expect(cropperMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aspect: 4,
      }),
    );
  });

  it('passes initial zoom to range slider', () => {
    render(<CropModal {...defaultProps} />);

    expect(rangeSliderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        min: 0,
        max: 3,
        step: 0.1,
        initialValue: 1,
        showButtons: true,
      }),
    );
  });

  it('updates zoom after range slider change', () => {
    render(<CropModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('range-slider'));

    expect(cropperMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        zoom: 2,
      }),
    );
  });

  it('calls onCancel on cancel click', () => {
    render(<CropModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('dialog-cancel'));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('calls getCroppedFile and onCrop on confirm when cropped area exists', async () => {
    render(<CropModal {...defaultProps} />);

    const croppedAreaPixels = {
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    };

    const file = new File(['cropped'], 'logo.png', { type: 'image/png' });
    (getCroppedFile as jest.Mock).mockResolvedValue(file);

    await act(async () => {
      const cropperProps = cropperMock.mock.calls[0][0];
      cropperProps.onCropComplete({}, croppedAreaPixels);
    });

    fireEvent.click(screen.getByTestId('dialog-continue'));

    await waitFor(() => {
      expect(getCroppedFile as jest.Mock).toHaveBeenCalledWith('image-url', croppedAreaPixels, 133, 47, 'logo.png');
    });

    expect(mockOnCrop).toHaveBeenCalledWith(file);
  });

  it('does nothing on confirm when imageSrc is null', async () => {
    render(<CropModal {...defaultProps} imageSrc={null} />);

    fireEvent.click(screen.getByTestId('dialog-continue'));

    await waitFor(() => {
      expect(getCroppedFile).not.toHaveBeenCalled();
    });
  });

  it('does nothing on confirm when cropped area is missing', async () => {
    render(<CropModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('dialog-continue'));

    await waitFor(() => {
      expect(getCroppedFile).not.toHaveBeenCalled();
    });
  });

  it('resets cropper state after successful confirm', async () => {
    render(<CropModal {...defaultProps} />);

    const file = new File(['cropped'], 'logo.png', { type: 'image/png' });
    (getCroppedFile as jest.Mock).mockResolvedValue(file);

    await act(async () => {
      const cropperProps = cropperMock.mock.calls[0][0];
      cropperProps.onCropChange({ x: 5, y: 6 });
      cropperProps.onZoomChange(2.5);
      cropperProps.onCropComplete({}, { x: 1, y: 2, width: 10, height: 20 });
    });

    fireEvent.click(screen.getByTestId('dialog-continue'));

    await waitFor(() => {
      expect(mockOnCrop).toHaveBeenCalledWith(file);
    });

    expect(cropperMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        crop: { x: 0, y: 0 },
        zoom: 1,
      }),
    );
  });

  it('resets cropper state on cancel', async () => {
    render(<CropModal {...defaultProps} />);

    const cropperProps = cropperMock.mock.calls[cropperMock.mock.calls.length - 1][0];

    await act(async () => {
      cropperProps.onCropChange({ x: 7, y: 8 });
      cropperProps.onZoomChange(2);
    });

    fireEvent.click(screen.getByTestId('dialog-cancel'));

    expect(cropperMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        crop: { x: 0, y: 0 },
        zoom: 1,
      }),
    );
  });

  it('handles cropper error without calling onCrop', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<CropModal {...defaultProps} />);

    (getCroppedFile as jest.Mock).mockRejectedValue(new Error('crop failed'));

    await act(async () => {
      const cropperProps = cropperMock.mock.calls[0][0];
      cropperProps.onCropComplete({}, { x: 1, y: 2, width: 10, height: 20 });
    });

    fireEvent.click(screen.getByTestId('dialog-continue'));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    expect(mockOnCrop).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('does not render when modal is closed', () => {
    render(<CropModal {...defaultProps} isModalOpened={false} />);

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });
});
