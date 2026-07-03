import { render, screen, fireEvent } from '@testing-library/react';
import { MapStyleSwitcherMobile } from 'components/Map/MapStyleSwitcher/MapStyleSwitcherMobile/MapStyleSwitcherMobile';
import type { MapStyles } from 'types/components';

jest.mock('components/UI', () => ({
  Dialog: ({ visible, header, onClose, children }: any) =>
    visible ? (
      <div data-testid="mock-dialog">
        <span data-testid="dialog-header">{header}</span>
        <button data-testid="dialog-close" onClick={onClose} />
        <div>{children}</div>
      </div>
    ) : null,
}));

jest.mock('assets/images/sattelite-thumbnail.png', () => 'satellite-thumbnail.png');
jest.mock('assets/images/map-thumbnail.png', () => 'map-thumbnail.png');

const mapStyles: MapStyles = [
  { name: 'Satellite', mapStyle: 'satellite-url', type: 'satellite' },
  { name: 'Streets', mapStyle: 'streets-url', type: 'streets' },
];

describe('MapStyleSwitcherMobile', () => {
  it('renders the switcher button', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    expect(screen.getByTestId('map-icon')).toBeInTheDocument();
  });

  it('does not show the dialog initially', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('opens the dialog when the button is clicked', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
  });

  it('shows the dialog title', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('dialog-header')).toHaveTextContent('Select a map style');
  });

  it('renders all map style items in the dialog', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Satellite satellite')).toBeInTheDocument();
    expect(screen.getByText('Streets streets')).toBeInTheDocument();
  });

  it('closes the dialog when onClose is called', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('mock-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('calls onMapStyleChange with the correct index when an item is selected', () => {
    const onMapStyleChange = jest.fn();
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={onMapStyleChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Streets streets' }));
    expect(onMapStyleChange).toHaveBeenCalledWith(1);
  });

  it('closes the dialog after selecting an item', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Streets streets' }));
    expect(screen.queryByTestId('mock-dialog')).not.toBeInTheDocument();
  });

  it('applies Active class to the currently selected item', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={1} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'Streets streets' })).toHaveClass('Active');
    expect(screen.getByRole('button', { name: 'Satellite satellite' })).not.toHaveClass('Active');
  });

  it('uses satellite thumbnail for satellite type', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'satellite-thumbnail.png');
  });

  it('uses map thumbnail for non-satellite type', () => {
    render(<MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} onMapStyleChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button'));
    const images = screen.getAllByRole('img');
    expect(images[1]).toHaveAttribute('src', 'map-thumbnail.png');
  });

  it('applies a custom className', () => {
    const { container } = render(
      <MapStyleSwitcherMobile mapStyles={mapStyles} currentValue={0} className="custom-class" onMapStyleChange={jest.fn()} />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
