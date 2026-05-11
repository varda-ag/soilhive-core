import { render, screen } from '@testing-library/react';
import { Cropper } from 'components/UI/Cropper/Cropper';

jest.mock('react-easy-crop', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-cropper" />,
}));

describe('Cropper', () => {
  it('renders cropper component', () => {
    render(<Cropper image="image-url" crop={{ x: 0, y: 0 }} zoom={1} aspect={1} onCropChange={jest.fn()} onZoomChange={jest.fn()} />);

    expect(screen.getByTestId('mock-cropper')).toBeInTheDocument();
  });
});
