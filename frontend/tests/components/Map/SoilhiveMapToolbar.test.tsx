import { render, screen } from '@testing-library/react';
import SoilhiveMapToolbar from 'components/Map/SoilhiveMapToolbar';
import { __setIsMobileLayout, __resetIsMobileLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');
jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ showNotification: jest.fn() }),
}));
jest.mock('@placemarkio/check-geojson', () => ({ check: jest.fn() }));

describe('SoilhiveMapToolbar', () => {
  afterEach(() => {
    __resetIsMobileLayout();
  });

  it('renders polygon button on desktop', () => {
    render(<SoilhiveMapToolbar visible={true} onDrawClick={jest.fn()} onUpload={jest.fn()} />);
    expect(screen.getByText('Polygon')).toBeInTheDocument();
  });

  it('does not render polygon button on mobile', () => {
    __setIsMobileLayout(true);
    render(<SoilhiveMapToolbar visible={true} onDrawClick={jest.fn()} onUpload={jest.fn()} />);
    expect(screen.queryByText('Polygon')).not.toBeInTheDocument();
  });
});
