import { render, screen } from '@testing-library/react';
import { MapStyleSwitcher } from 'components/Map/MapStyleSwitcher/MapStyleSwitcher';
import { __setIsMobileLayout, __resetIsMobileLayout } from 'hooks/useDevice';
import type { MapStyles } from 'types/components';

jest.mock('hooks/useDevice');

jest.mock('components/Map/MapStyleSwitcher/MapStyleSwitcherDesktop/MapStyleSwitcherDesktop', () => ({
  MapStyleSwitcherDesktop: ({ mapStyles, currentValue, className, onMapStyleChange }: any) => (
    <div
      data-testid="map-style-switcher-desktop"
      data-current-value={currentValue}
      data-class-name={className}
      data-styles-count={mapStyles.length}
      onClick={() => onMapStyleChange(0)}
    />
  ),
}));

jest.mock('components/Map/MapStyleSwitcher/MapStyleSwitcherMobile/MapStyleSwitcherMobile', () => ({
  MapStyleSwitcherMobile: ({ mapStyles, currentValue, className, onMapStyleChange }: any) => (
    <div
      data-testid="map-style-switcher-mobile"
      data-current-value={currentValue}
      data-class-name={className}
      data-styles-count={mapStyles.length}
      onClick={() => onMapStyleChange(0)}
    />
  ),
}));

const mapStyles: MapStyles = [
  { name: 'Satellite', mapStyle: 'satellite-url', type: 'satellite' },
  { name: 'Streets', mapStyle: 'streets-url', type: 'streets' },
];

describe('MapStyleSwitcher', () => {
  afterEach(() => {
    jest.clearAllMocks();
    __resetIsMobileLayout();
  });

  it('renders MapStyleSwitcherDesktop when not mobile', () => {
    __setIsMobileLayout(false);
    render(<MapStyleSwitcher mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    expect(screen.getByTestId('map-style-switcher-desktop')).toBeInTheDocument();
    expect(screen.queryByTestId('map-style-switcher-mobile')).not.toBeInTheDocument();
  });

  it('renders MapStyleSwitcherMobile when mobile', () => {
    __setIsMobileLayout(true);
    render(<MapStyleSwitcher mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    expect(screen.getByTestId('map-style-switcher-mobile')).toBeInTheDocument();
    expect(screen.queryByTestId('map-style-switcher-desktop')).not.toBeInTheDocument();
  });

  it('passes all props to the desktop variant', () => {
    __setIsMobileLayout(false);
    render(<MapStyleSwitcher mapStyles={mapStyles} currentValue={1} className="my-class" onMapStyleChange={jest.fn()} />);
    const el = screen.getByTestId('map-style-switcher-desktop');
    expect(el).toHaveAttribute('data-current-value', '1');
    expect(el).toHaveAttribute('data-class-name', 'my-class');
    expect(el).toHaveAttribute('data-styles-count', '2');
  });

  it('passes all props to the mobile variant', () => {
    __setIsMobileLayout(true);
    render(<MapStyleSwitcher mapStyles={mapStyles} currentValue={1} className="my-class" onMapStyleChange={jest.fn()} />);
    const el = screen.getByTestId('map-style-switcher-mobile');
    expect(el).toHaveAttribute('data-current-value', '1');
    expect(el).toHaveAttribute('data-class-name', 'my-class');
    expect(el).toHaveAttribute('data-styles-count', '2');
  });
});
