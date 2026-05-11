import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UploadLogo } from 'components/AdminPortal/LookAndFeel/UploadLogo/UploadLogo';
import useLookAndFeel from 'hooks/useLookAndFeel';

jest.mock('hooks/useLookAndFeel', jest.fn);

const fileUploadBoxMock = jest.fn();
const cropLogoModalMock = jest.fn();
const logoPreviewMock = jest.fn();

jest.mock('components/UI', () => ({
  FileUploadBox: (props: any) => {
    fileUploadBoxMock(props);
    return (
      <div data-testid="file-upload-box">
        <button data-testid="file-upload-valid" onClick={() => props.handleFiles([new File(['img'], 'logo.png', { type: 'image/png' })])}>
          valid file
        </button>
        <button data-testid="file-upload-invalid" onClick={() => props.handleFiles([new File(['img'], 'logo.gif', { type: 'image/gif' })])}>
          invalid file
        </button>
      </div>
    );
  },
}));

jest.mock('components/AdminPortal/LookAndFeel/CropLogoModal/CropLogoModal', () => ({
  CropLogoModal: (props: any) => {
    cropLogoModalMock(props);
    return (
      <div data-testid="crop-logo-modal">
        <div data-testid="crop-modal-opened">{String(props.isModalOpened)}</div>
        <div data-testid="crop-modal-image">{props.imageSrc ?? 'null'}</div>
        <button data-testid="crop-confirm" onClick={() => props.onCrop(new File(['cropped'], 'cropped.png', { type: 'image/png' }))}>
          crop confirm
        </button>
        <button data-testid="crop-cancel" onClick={props.onCancel}>
          crop cancel
        </button>
      </div>
    );
  },
}));

jest.mock('components/AdminPortal/LookAndFeel/LogoPreview/LogoPreview', () => ({
  LogoPreview: (props: any) => {
    logoPreviewMock(props);
    return (
      <div data-testid="logo-preview">
        <div data-testid="logo-preview-src">{props.previewLogo}</div>
        <div data-testid="logo-preview-actual">{String(props.isActualLogo)}</div>
        <div data-testid="logo-preview-error">{props.errorMessage ?? 'null'}</div>
        <button data-testid="logo-preview-change" onClick={props.onChange}>
          change
        </button>
        <button data-testid="logo-preview-delete" onClick={props.onDelete}>
          delete
        </button>
      </div>
    );
  },
}));

describe('UploadLogo', () => {
  const handleLogoChange = jest.fn();
  const deleteLogo = jest.fn();

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      isLoading: false,
      previewLogo: null,
      isActualLogo: true,
      handleLogoChange,
      deleteLogo,
    });

    URL.createObjectURL = jest.fn(() => 'blob:source-logo');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('renders nothing while loading', () => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      isLoading: true,
      previewLogo: null,
      isActualLogo: true,
      handleLogoChange,
      deleteLogo,
    });

    const { container } = render(<UploadLogo />);

    expect(container.firstChild).toBeNull();
  });

  it('renders upload state without preview logo', () => {
    const { container } = render(<UploadLogo />);

    expect(screen.getByText('Your picture will appear in the header')).toBeInTheDocument();
    expect(screen.getByTestId('file-upload-box')).toBeInTheDocument();
    expect(screen.getByTestId('crop-logo-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('logo-preview')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders LogoPreview when preview logo exists', () => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      isLoading: false,
      previewLogo: 'preview-logo.png',
      isActualLogo: false,
      handleLogoChange,
      deleteLogo,
    });

    const { container } = render(<UploadLogo />);

    expect(screen.getByTestId('logo-preview')).toBeInTheDocument();
    expect(screen.getByTestId('logo-preview-src')).toHaveTextContent('preview-logo.png');
    expect(screen.getByTestId('logo-preview-actual')).toHaveTextContent('false');
    expect(container).toMatchSnapshot();
  });

  it('opens crop modal with created object url for supported file', async () => {
    render(<UploadLogo />);

    fireEvent.click(screen.getByTestId('file-upload-valid'));

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('true');
    expect(screen.getByTestId('crop-modal-image')).toHaveTextContent('blob:source-logo');
  });

  it('shows error and does not open crop modal for unsupported file', async () => {
    render(<UploadLogo />);

    fireEvent.click(screen.getByTestId('file-upload-invalid'));

    await waitFor(() => {
      expect(fileUploadBoxMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          errorMessage: 'Unsupported file format. Please upload a PNG, JPG or SVG file.',
        }),
      );
    });

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('false');
  });

  it('revokes previous source url when new supported file is selected', async () => {
    (URL.createObjectURL as jest.Mock).mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');

    render(<UploadLogo />);

    fireEvent.click(screen.getByTestId('file-upload-valid'));

    await waitFor(() => {
      expect(screen.getByTestId('crop-modal-image')).toHaveTextContent('blob:first');
    });

    fireEvent.click(screen.getByTestId('file-upload-valid'));

    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    });

    expect(screen.getByTestId('crop-modal-image')).toHaveTextContent('blob:second');
  });

  it('handles crop confirm by passing cropped file to handleLogoChange and resetting modal', async () => {
    render(<UploadLogo />);

    fireEvent.click(screen.getByTestId('file-upload-valid'));

    await waitFor(() => {
      expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByTestId('crop-confirm'));

    await waitFor(() => {
      expect(handleLogoChange).toHaveBeenCalledTimes(1);
    });

    expect(handleLogoChange.mock.calls[0][0]).toBeInstanceOf(File);
    expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('false');
    expect(screen.getByTestId('crop-modal-image')).toHaveTextContent('null');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source-logo');
  });

  it('handles crop cancel by resetting modal state and revoking source url', async () => {
    render(<UploadLogo />);

    fireEvent.click(screen.getByTestId('file-upload-valid'));

    await waitFor(() => {
      expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByTestId('crop-cancel'));

    await waitFor(() => {
      expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('crop-modal-image')).toHaveTextContent('null');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:source-logo');
  });

  it('clears error and calls deleteLogo on preview delete', () => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      isLoading: false,
      previewLogo: 'preview-logo.png',
      isActualLogo: true,
      handleLogoChange,
      deleteLogo,
    });

    render(<UploadLogo />);

    fireEvent.click(screen.getByTestId('logo-preview-delete'));

    expect(deleteLogo).toHaveBeenCalledTimes(1);
  });

  it('passes null errorMessage to LogoPreview after delete', () => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      isLoading: false,
      previewLogo: 'preview-logo.png',
      isActualLogo: true,
      handleLogoChange,
      deleteLogo,
    });

    render(<UploadLogo />);

    expect(logoPreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: null,
      }),
    );
  });

  it('clicks file input when preview change is triggered', () => {
    const mockTest = jest.fn();

    (useLookAndFeel as jest.Mock).mockReturnValue({
      isLoading: false,
      previewLogo: 'preview-logo.png',
      isActualLogo: true,
      handleLogoChange,
      deleteLogo,
    });

    render(<UploadLogo />);

    const fileInputRef = fileUploadBoxMock.mock.calls[0][0].fileInputRef;
    fileInputRef.current = {
      click: mockTest,
      value: '',
    };

    fireEvent.click(screen.getByTestId('logo-preview-change'));

    expect(mockTest).toHaveBeenCalledTimes(1);
  });

  it('does nothing when files list is empty', () => {
    render(<UploadLogo />);

    const handleFiles = fileUploadBoxMock.mock.calls[0][0].handleFiles;

    handleFiles([]);

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByTestId('crop-modal-opened')).toHaveTextContent('false');
  });
});
