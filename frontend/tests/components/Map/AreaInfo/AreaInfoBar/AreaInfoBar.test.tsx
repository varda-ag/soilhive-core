import { render, screen, fireEvent } from '@testing-library/react';

import { AreaInfoBar } from 'components/Map/AreaInfo/AreaInfoBar/AreaInfoBar';
import type { MapSelection } from '../../../../../src/contexts/AvailabilityMapContext';

jest.mock('components/Map/AreaInfo/AreaInfoContent/AreaInfoContent', () => ({
  AreaInfoContent: ({ selection, locationName }: { selection: MapSelection; locationName?: string }) => (
    <div data-testid="area-info-content" data-location-name={locationName} data-features-count={selection.features.length} />
  ),
}));

const mockSelection: MapSelection = {
  type: 'FeatureCollection',
  features: [],
};

describe('AreaInfoBar', () => {
  it('renders the bar', () => {
    const { container } = render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    expect(container).toMatchSnapshot();
  });

  it('renders AreaInfoContent with selection and locationName', () => {
    render(<AreaInfoBar selection={mockSelection} locationName="My Field" onClose={jest.fn()} />);

    const content = screen.getByTestId('area-info-content');
    expect(content).toBeInTheDocument();
    expect(content).toHaveAttribute('data-location-name', 'My Field');
  });

  it('renders AreaInfoContent without locationName when omitted', () => {
    render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    expect(screen.getByTestId('area-info-content')).not.toHaveAttribute('data-location-name');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = jest.fn();

    render(<AreaInfoBar selection={mockSelection} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-areainfobar-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('content is collapsed by default', () => {
    const { container } = render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    const contentWrapper = container.querySelector('.AreaInfoBarContent');
    expect(contentWrapper).not.toHaveClass('Opened');
  });

  it('expands content when expand button is clicked', () => {
    const { container } = render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTestId('sh-areainfobar-expand'));

    const contentWrapper = container.querySelector('.AreaInfoBarContent');
    expect(contentWrapper).toHaveClass('Opened');
  });

  it('collapses content when expand button is clicked twice', () => {
    const { container } = render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    const expandButton = screen.getByTestId('sh-areainfobar-expand');
    fireEvent.click(expandButton);
    fireEvent.click(expandButton);

    const contentWrapper = container.querySelector('.AreaInfoBarContent');
    expect(contentWrapper).not.toHaveClass('Opened');
  });

  it('applies Opened class to arrow icon when expanded', () => {
    const { container } = render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTestId('sh-areainfobar-expand'));

    const arrowIcon = container.querySelector('.ArrowIcon');
    expect(arrowIcon).toHaveClass('Opened');
  });

  it('does not apply Opened class to arrow icon when collapsed', () => {
    const { container } = render(<AreaInfoBar selection={mockSelection} onClose={jest.fn()} />);

    const arrowIcon = container.querySelector('.ArrowIcon');
    expect(arrowIcon).not.toHaveClass('Opened');
  });
});
