import { render, screen, fireEvent, act } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { MapSettings } from '../../../src/pages/AdminPortal/MapSettings/MapSettings';
import SoilhiveSimpleMap from '../../../src/components/Map/SoilhiveSimpleMap';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/Map/SoilhiveSimpleMap', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="soilhive-simple-map" />),
}));

jest.mock('pages/AdminPortal/MapSettings/MapCoverageSettings/MapCoverageSettings', () => ({
  MapCoverageSettings: ({ isDaiEnabled, defaultValue, onActivationChange, onDefaultValueChange }: any) => (
    <div data-testid="map-coverage-settings" data-is-dai-enabled={String(isDaiEnabled)} data-default-value={String(defaultValue)}>
      <button data-testid="toggle-dai" onClick={onActivationChange} />
      <button data-testid="set-default-active" onClick={() => onDefaultValueChange(true)} />
      <button data-testid="set-default-inactive" onClick={() => onDefaultValueChange(false)} />
    </div>
  ),
}));

jest.mock('components/UI', () => ({
  Button: ({ onClick, children }: any) => (
    <button data-testid="sh-ui-button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const baseThemeConfig = {
  initialBbox: [0, 0, 1, 1],
  daiConfig: { isEnabled: false, defaultValue: false },
};

describe('MapSettings page', () => {
  let saveMapSettings: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    saveMapSettings = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: baseThemeConfig, saveMapSettings });
  });

  it('matches snapshot', () => {
    const { container } = render(<MapSettings />);
    expect(container).toMatchSnapshot();
  });

  it('renders the map', () => {
    render(<MapSettings />);
    expect(screen.getByTestId('soilhive-simple-map')).toBeInTheDocument();
  });

  it('renders the save button', () => {
    render(<MapSettings />);
    expect(screen.getByText('Save changes')).toBeInTheDocument();
  });

  it('renders MapCoverageSettings with initial daiConfig values', () => {
    render(<MapSettings />);
    const el = screen.getByTestId('map-coverage-settings');
    expect(el).toHaveAttribute('data-is-dai-enabled', 'false');
    expect(el).toHaveAttribute('data-default-value', 'false');
  });

  it('passes initialBbox to SoilhiveSimpleMap', () => {
    render(<MapSettings />);
    const mapProps = (SoilhiveSimpleMap as jest.Mock).mock.calls[0][0];
    expect(mapProps.initialViewBoundingBox).toEqual([0, 0, 1, 1]);
  });

  it('calls saveMapSettings with current bbox and daiConfig on save', () => {
    render(<MapSettings />);
    fireEvent.click(screen.getByText('Save changes'));
    expect(saveMapSettings).toHaveBeenCalledWith([0, 0, 1, 1], { isEnabled: false, defaultValue: false });
  });

  it('calls saveMapSettings with updated bbox after onBboxChange', () => {
    render(<MapSettings />);
    const mapProps = (SoilhiveSimpleMap as jest.Mock).mock.calls[0][0];
    act(() => {
      mapProps.onBboxChange([1, 2, 3, 4]);
    });
    fireEvent.click(screen.getByText('Save changes'));
    expect(saveMapSettings).toHaveBeenCalledWith([1, 2, 3, 4], { isEnabled: false, defaultValue: false });
  });

  it('calls saveMapSettings with updated isDaiEnabled after toggle', () => {
    render(<MapSettings />);
    fireEvent.click(screen.getByTestId('toggle-dai'));
    fireEvent.click(screen.getByText('Save changes'));
    expect(saveMapSettings).toHaveBeenCalledWith([0, 0, 1, 1], { isEnabled: true, defaultValue: false });
  });

  it('calls saveMapSettings with updated defaultValue after onDefaultValueChange', () => {
    render(<MapSettings />);
    fireEvent.click(screen.getByTestId('set-default-active'));
    fireEvent.click(screen.getByText('Save changes'));
    expect(saveMapSettings).toHaveBeenCalledWith([0, 0, 1, 1], { isEnabled: false, defaultValue: true });
  });

  it('initialises isDaiEnabled from themeConfig.daiConfig.isEnabled', () => {
    (useTheme as jest.Mock).mockReturnValue({
      themeConfig: { ...baseThemeConfig, daiConfig: { isEnabled: true, defaultValue: false } },
      saveMapSettings,
    });
    render(<MapSettings />);
    expect(screen.getByTestId('map-coverage-settings')).toHaveAttribute('data-is-dai-enabled', 'true');
  });

  it('initialises defaultValue from themeConfig.daiConfig.defaultValue', () => {
    (useTheme as jest.Mock).mockReturnValue({
      themeConfig: { ...baseThemeConfig, daiConfig: { isEnabled: false, defaultValue: true } },
      saveMapSettings,
    });
    render(<MapSettings />);
    expect(screen.getByTestId('map-coverage-settings')).toHaveAttribute('data-default-value', 'true');
  });
});
