import { render, screen, fireEvent } from '@testing-library/react';
import SoilhiveMapToolbar from 'components/Map/SoilhiveMapToolbar';
import { __setIsMobileLayout, __resetIsMobileLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

jest.mock('components/Map/UploadPolygonModal/UploadPolygonModal', () => ({
  UploadPolygonModal: ({ visible, onClose, onUpload }: any) => (
    <div data-testid="upload-polygon-modal" data-visible={String(visible)}>
      <button data-testid="modal-close" onClick={onClose} />
      <button data-testid="modal-upload" onClick={onUpload} />
    </div>
  ),
}));

describe('SoilhiveMapToolbar', () => {
  const mockOnUpload = jest.fn();
  const defaultProps = {
    visible: true,
    onDrawClick: jest.fn(),
    onUpload: mockOnUpload,
  };

  afterEach(() => {
    __resetIsMobileLayout();
    jest.clearAllMocks();
  });

  it('renders the polygon button on desktop', () => {
    render(<SoilhiveMapToolbar {...defaultProps} />);
    expect(screen.getByText('Polygon')).toBeInTheDocument();
  });

  it('does not render the polygon button on mobile', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveMapToolbar {...defaultProps} />);
    expect(screen.queryByText('Polygon')).not.toBeInTheDocument();
  });

  it('opens the UploadPolygonModal when the upload button is clicked', () => {
    const { container } = render(<SoilhiveMapToolbar {...defaultProps} />);
    const uploadButton = container.querySelector('.selection-list')!.querySelectorAll('button')[1];
    fireEvent.click(uploadButton);
    expect(screen.getByTestId('upload-polygon-modal')).toHaveAttribute('data-visible', 'true');
  });

  it('closes the UploadPolygonModal when its onClose is called', () => {
    const { container } = render(<SoilhiveMapToolbar {...defaultProps} />);
    const uploadButton = container.querySelector('.selection-list')!.querySelectorAll('button')[1];
    fireEvent.click(uploadButton);
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.getByTestId('upload-polygon-modal')).toHaveAttribute('data-visible', 'false');
  });

  it('calls onUpload when upload is triggered by the UploadPolygonModal', () => {
    const { container } = render(<SoilhiveMapToolbar {...defaultProps} />);
    const uploadButton = container.querySelector('.selection-list')!.querySelectorAll('button')[1];
    fireEvent.click(uploadButton);
    fireEvent.click(screen.getByTestId('modal-upload'));
    expect(mockOnUpload).toHaveBeenCalled();
  });
});
