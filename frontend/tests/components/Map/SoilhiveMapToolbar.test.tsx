import { render, screen, fireEvent } from '@testing-library/react';
import SoilhiveMapToolbar from 'components/Map/SoilhiveMapToolbar';
import { __setIsMobileLayout, __resetIsMobileLayout, __setIsMobileDevice, __resetIsMobileDevice } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

describe('SoilhiveMapToolbar', () => {
  const defaultProps = {
    visible: true,
    onDrawClick: jest.fn(),
  };

  afterEach(() => {
    __resetIsMobileLayout();
    __resetIsMobileDevice();
    jest.clearAllMocks();
  });

  it('renders the polygon button on desktop', () => {
    render(<SoilhiveMapToolbar {...defaultProps} />);
    expect(screen.getByText('Polygon')).toBeInTheDocument();
  });

  it('does not render the polygon button on a phone', () => {
    __setIsMobileDevice(true);
    render(<SoilhiveMapToolbar {...defaultProps} />);
    expect(screen.queryByText('Polygon')).not.toBeInTheDocument();
  });

  it('renders the polygon button in a narrow window on a laptop', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveMapToolbar {...defaultProps} />);
    expect(screen.getByText('Polygon')).toBeInTheDocument();
  });

  it('does not render an upload option when onUploadClick is omitted (the plugin scenario)', () => {
    render(<SoilhiveMapToolbar {...defaultProps} />);
    expect(screen.queryByText('Upload a polygon')).not.toBeInTheDocument();
  });

  it('renders an upload option and calls onUploadClick when clicked, without importing/rendering any modal itself', () => {
    const onUploadClick = jest.fn();
    const { container } = render(<SoilhiveMapToolbar {...defaultProps} onUploadClick={onUploadClick} />);

    const uploadButton = container.querySelector('.selection-list')!.querySelectorAll('button')[1];
    fireEvent.click(uploadButton);

    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });
});
