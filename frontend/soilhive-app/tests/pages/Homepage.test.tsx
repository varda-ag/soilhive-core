import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Homepage from '../../src/pages/Homepage';
import { __setIsDesktopLayout } from 'hooks/useDevice';
import type { SoilhiveMapSelectionChangeEvent } from 'components/Map/SoilhiveMapSelectionChangeEvent';

let mockOnMapSelectionChange: ((event: any) => void) | undefined;

/* eslint-disable react-hooks/globals */
jest.mock('components/Map/SoilhiveMap', () => {
  // Define the mock component with a name
  const MockSoilhiveMap: React.FC<{ onSelectionChange: (event: unknown) => void }> = ({ onSelectionChange }) => {
    mockOnMapSelectionChange = onSelectionChange;
    return <div data-test-id="mock-soilhive-map">Mock SoilhiveMap</div>;
  };

  // The component name is inferred from the function name
  return MockSoilhiveMap;
});
/* eslint-enable react-hooks/globals */
jest.mock('../../src/utilities/environmentVariables', () => ({
  MAPBOX_ACCESS_TOKEN: 'mock_access_token',
}));
jest.mock('hooks/useDevice');

jest.mock('components/DatasetsSidebar/DatasetsSidebar', () => ({
  DatasetsSidebar: ({ onClose, isOpened }: any) => (
    <div data-testid="mock-datasets-sidebar" data-opened={isOpened}>
      Mock DatasetsSidebar
      <button onClick={onClose}>Close DatasetsSidebar</button>
    </div>
  ),
}));

jest.mock('components/FilteringSidebar/FilteringSidebar', () => ({
  FilteringSidebar: ({ onClose, isOpened }: any) => (
    <div data-testid="mock-filtering-sidebar" data-opened={isOpened}>
      Mock FilteringSidebar
      <button onClick={onClose}>Close FilteringSidebar</button>
    </div>
  ),
}));

jest.mock('components/FilteringSidebar/FiltersCounter/FiltersCounter', () => ({
  FiltersCounter: () => <div data-testid="mock-filters-counter">Mock FiltersCounter</div>,
}));

jest.mock('../../src/contexts/AvailabilityContext', () => {
  // let's define the setGeometryFilter mock function here and export here down below
  // so that we can later grab it
  const mockSetGeometryFilter = jest.fn();

  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      setGeometryFilter: mockSetGeometryFilter,
    }),
    mockSetGeometryFilter,
  };
});

// grab the mock setGeometryFilter function that was passed to availability context
const { mockSetGeometryFilter } = jest.requireMock('../../src/contexts/AvailabilityContext');

describe('Homepage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders homepage on desktop', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Homepage />);
    expect(container).toMatchSnapshot();
  });

  it('closes DatasetsSidebar by clicking on the close button in the sidebar', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Homepage />);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(screen.getByText('Close DatasetsSidebar'));

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'false');
    expect(container.querySelector('.DatasetsButton') as Element).toBeInTheDocument();
  });

  it('reopens DatasetsSidebar by clicking on the DatasetsButton homepage', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Homepage />);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(screen.getByText('Close DatasetsSidebar'));
    const datasetsButton = container.querySelector('.DatasetsButton') as Element;
    fireEvent.click(datasetsButton);

    expect(datasetsButton).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');
  });

  it('opens FilteringSidebar by clicking on the FiltersButton homepage', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Homepage />);

    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'false');

    const filtersButton = container.querySelector('.FiltersButton') as Element;
    fireEvent.click(filtersButton);

    expect(filtersButton).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'true');
  });

  it('closes FilteringSidebar by clicking on the close button in the sidebar', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Homepage />);

    fireEvent.click(container.querySelector('.FiltersButton') as Element);

    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(screen.getByText('Close FilteringSidebar'));

    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'false');
    expect(container.querySelector('.FiltersButton') as Element).toBeInTheDocument();
  });

  it('renders homepage on mobile', () => {
    __setIsDesktopLayout(false);
    const { container } = render(<Homepage />);
    expect(container).toMatchSnapshot();
  });

  it('changes tabs by clicking on mobile navigation', () => {
    __setIsDesktopLayout(false);
    render(<Homepage />);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'false');

    const navButtons = screen.getAllByTestId('sh-ui-mobile-tab-navigation-item');
    fireEvent.click(navButtons[2]);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(navButtons[0]);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'false');
  });

  it('calls setGeometryFilter with geometries when both bbox and geometries are provided', () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    const geometries = [
      {
        type: 'Polygon' as any,
        coordinates: [
          [
            [6.0, 35.0],
            [18.0, 35.0],
            [18.0, 47.0],
            [6.0, 47.0],
            [6.0, 35.0],
          ],
        ],
      },
    ];
    const mockEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      geometries,
      zoomLevel: 10,
    };

    const onSelectionChange = mockOnMapSelectionChange;

    // Act
    act(() => onSelectionChange!(mockEvent));

    // Assert
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
    expect(mockSetGeometryFilter).toHaveBeenCalledWith(geometries);
  });

  it('calls setGeometryFilter with bbox (as Polygon) when no geometries provided', () => {
    // Arrange
    render(<Homepage />);

    const mockEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      // No geometries provided
      zoomLevel: 10,
    };

    // Act
    act(() => mockOnMapSelectionChange!(mockEvent));

    // Assert
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);

    // The geometry should be created from bboxPolygon
    const geometries = mockSetGeometryFilter.mock.calls[0][0];
    expect(geometries).toHaveLength(1);
    expect(geometries[0].type).toBe('Polygon');
    expect(geometries[0].coordinates).toBeDefined();
  });
});
