import { render, screen, fireEvent } from '@testing-library/react';
import { MapStyleSwitcherDesktop } from 'components/Map/MapStyleSwitcher/MapStyleSwitcherDesktop/MapStyleSwitcherDesktop';
import type { MapStyles } from 'types/components';

const mapStyles: MapStyles = [
  { name: 'Satellite', mapStyle: 'satellite-url', type: 'satellite' },
  { name: 'Streets', mapStyle: 'streets-url', type: 'streets' },
  { name: 'Terrain', mapStyle: 'terrain-url', type: 'terrain' },
];

describe('MapStyleSwitcherDesktop', () => {
  it('renders selector with all map style options', () => {
    render(<MapStyleSwitcherDesktop mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'map-styles');
    expect(screen.getByRole('option', { name: 'Satellite' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Streets' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Terrain' })).toBeInTheDocument();
  });

  it('sets the default selected option from currentValue', () => {
    render(<MapStyleSwitcherDesktop mapStyles={mapStyles} currentValue={1} onMapStyleChange={jest.fn()} />);
    expect(screen.getByRole('combobox')).toHaveValue('1');
  });

  it('calls onMapStyleChange with the selected index when changed', () => {
    const onMapStyleChange = jest.fn();
    render(<MapStyleSwitcherDesktop mapStyles={mapStyles} currentValue={0} onMapStyleChange={onMapStyleChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(onMapStyleChange).toHaveBeenCalledWith(2);
  });

  it('applies a custom className', () => {
    const { container } = render(
      <MapStyleSwitcherDesktop mapStyles={mapStyles} currentValue={0} className="custom-class" onMapStyleChange={jest.fn()} />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
