import { render, screen } from '@testing-library/react';
import { CropLogoModal } from 'components/AdminPortal/LookAndFeel/CropLogoModal/CropLogoModal';

const cropModalMock = jest.fn();

jest.mock('components/CropModal/CropModal', () => ({
  CropModal: (props: any) => {
    cropModalMock(props);
    return <div data-testid="crop-modal" />;
  },
}));

describe('CropLogoModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders CropModal', () => {
    render(<CropLogoModal isModalOpened imageSrc="image-url" onCrop={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('crop-modal')).toBeInTheDocument();
  });

  it('passes correct props to CropModal', () => {
    const onCrop = jest.fn();
    const onCancel = jest.fn();

    render(<CropLogoModal isModalOpened imageSrc="image-url" onCrop={onCrop} onCancel={onCancel} />);

    expect(cropModalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isModalOpened: true,
        imageSrc: 'image-url',
        outputWidth: 668,
        outputHeight: 236,
        fileName: 'logo.png',
        headerText: 'Upload a logo',
        secondaryText: 'Cancel',
        primaryText: 'Upload',
        onCrop,
        onCancel,
      }),
    );
  });
});
