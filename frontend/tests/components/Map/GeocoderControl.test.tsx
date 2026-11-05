import { render } from '@testing-library/react';
import GeocoderControl from 'components/Map/GeocoderControl';

// The control as useControl returns it once added to the map: a container holding the search box
const mockGeocoder = { container: document.createElement('div'), _geocode: jest.fn(), _renderMessage: jest.fn(), _map: undefined };

jest.mock('react-map-gl/maplibre', () => ({
  useControl: () => mockGeocoder,
  Marker: () => null,
}));
jest.mock('@maplibre/maplibre-gl-geocoder', () => ({ __esModule: true, default: jest.fn() }));

describe('GeocoderControl', () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGeocoder.container = document.createElement('div');
    input = document.createElement('input');
    mockGeocoder.container.appendChild(input);
  });

  it('writes the initial value in the search box without searching, as after a sign-in on a searched place', () => {
    render(<GeocoderControl position="top-left" initialValue="Nakuru, Kenya" />);

    expect(input.value).toBe('Nakuru, Kenya');
    expect(mockGeocoder._geocode).not.toHaveBeenCalled();
  });

  it('leaves the search box empty without one', () => {
    render(<GeocoderControl position="top-left" />);

    expect(input.value).toBe('');
  });

  it('never overwrites what the visitor has typed', () => {
    const { rerender } = render(<GeocoderControl position="top-left" initialValue="Nakuru, Kenya" />);
    input.value = 'Turin';

    rerender(<GeocoderControl position="top-left" initialValue="Nakuru, Kenya" />);

    expect(input.value).toBe('Turin');
  });
});
