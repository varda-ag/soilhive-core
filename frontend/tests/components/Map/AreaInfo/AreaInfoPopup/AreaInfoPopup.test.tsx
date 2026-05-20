import { render, screen, fireEvent } from '@testing-library/react';

import { AreaInfoPopup } from 'components/Map/AreaInfo/AreaInfoPopup/AreaInfoPopup';
import type { MapSelection } from '../../../../../src/contexts/AvailabilityMapContext';
import { type LngLat } from 'maplibre-gl';

jest.mock('react-map-gl/maplibre', () => ({
  Popup: ({
    children,
    longitude,
    latitude,
    onClose,
  }: {
    children: React.ReactNode;
    longitude: number;
    latitude: number;
    onClose: () => void;
  }) => (
    <div data-testid="popup" data-longitude={longitude} data-latitude={latitude}>
      <button data-testid="popup-close" onClick={onClose} />
      {children}
    </div>
  ),
}));

jest.mock('components/Map/AreaInfo/AreaInfoContent/AreaInfoContent', () => ({
  AreaInfoContent: ({ selection, locationName }: { selection: MapSelection; locationName?: string }) => (
    <div data-testid="area-info-content" data-location-name={locationName} data-features-count={selection.features.length} />
  ),
}));

const mockSelection: MapSelection = {
  type: 'FeatureCollection',
  features: [],
};

const mockSelectedPoint = { lng: 12.34, lat: 56.78 } as LngLat;

describe('AreaInfoPopup', () => {
  it('renders the popup', () => {
    const { container } = render(<AreaInfoPopup selectedPoint={mockSelectedPoint} selection={mockSelection} onClose={jest.fn()} />);

    expect(container).toMatchSnapshot();
  });

  it('passes longitude and latitude from selectedPoint to Popup', () => {
    render(<AreaInfoPopup selectedPoint={mockSelectedPoint} selection={mockSelection} onClose={jest.fn()} />);

    const popup = screen.getByTestId('popup');
    expect(popup).toHaveAttribute('data-longitude', '12.34');
    expect(popup).toHaveAttribute('data-latitude', '56.78');
  });

  it('renders AreaInfoContent with selection and locationName', () => {
    render(<AreaInfoPopup selectedPoint={mockSelectedPoint} selection={mockSelection} locationName="My Field" onClose={jest.fn()} />);

    const content = screen.getByTestId('area-info-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveAttribute('data-location-name', 'My Field');
  });

  it('renders AreaInfoContent without locationName when omitted', () => {
    render(<AreaInfoPopup selectedPoint={mockSelectedPoint} selection={mockSelection} onClose={jest.fn()} />);

    const content = screen.getByTestId('area-info-content');
    expect(content).not.toHaveAttribute('data-location-name');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();

    render(<AreaInfoPopup selectedPoint={mockSelectedPoint as any} selection={mockSelection} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-areainfopopup-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
