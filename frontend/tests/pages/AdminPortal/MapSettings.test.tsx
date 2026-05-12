import { render, fireEvent, act } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { MapSettings } from '../../../src/pages/AdminPortal/MapSettings/MapSettings';
import SoilhiveSimpleMap from '../../../src/components/Map/SoilhiveSimpleMap';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/Map/GeocoderControl', () => ({
  __esModule: true,
  default: () => jest.fn(),
}));

jest.mock('components/Map/SoilhiveSimpleMap', () => ({
  __esModule: true,
  default: jest.fn(_props => {
    // Render something neutral that won't change between runs
    return <div data-testid="soilhive-simple-map" />;
  }),
}));

describe('MapSettings page', () => {
  let saveInitialBbox: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    saveInitialBbox = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: { initialBbox: [0, 0, 1, 1] }, saveInitialBbox });
  });

  it('matches snapshot', () => {
    const { container } = render(<MapSettings />);
    expect(container).toMatchSnapshot();
  });

  it('calls saveInitialBbox with current bbox when save button is clicked', () => {
    const { getByText } = render(<MapSettings />);
    const saveButton = getByText('Set view as default');
    fireEvent.click(saveButton);
    expect(saveInitialBbox).toHaveBeenCalledWith([0, 0, 1, 1]);
  });

  it('updates bbox state and calls saveInitialBbox with new bbox', () => {
    const { getByText } = render(<MapSettings />);

    // Grab the props passed to the mock at render time
    const mapProps = (SoilhiveSimpleMap as jest.Mock).mock.calls[0][0];

    // Call onBboxChange directly — no DOM interaction needed
    act(() => {
      mapProps.onBboxChange([1, 2, 3, 4]);
    });

    const saveButton = getByText('Set view as default');
    fireEvent.click(saveButton);
    expect(saveInitialBbox).toHaveBeenCalledWith([1, 2, 3, 4]);
  });
});
