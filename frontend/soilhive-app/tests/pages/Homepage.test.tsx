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

  it('calls setGeometryFilter when map selection changes with geometries', () => {
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
      eventType: 'draw',
      zoomLevel: 10,
    };

    const onSelectionChange = mockOnMapSelectionChange;

    // Act
    onSelectionChange!(mockEvent);

    // Assert
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
    expect(mockSetGeometryFilter).toHaveBeenCalledWith(geometries);
  });

  it('calls setGeometryFilter with bbox geometry when no geometries provided', () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    const mockEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      // No geometries provided
      eventType: 'draw',
      zoomLevel: 10,
    };

    // Act
    mockOnMapSelectionChange!(mockEvent);

    // Assert
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);

    // The geometry should be created from bboxPolygon
    const geometries = mockSetGeometryFilter.mock.calls[0][0];
    expect(geometries).toHaveLength(1);
    expect(geometries[0].type).toBe('Polygon');
    expect(geometries[0].coordinates).toBeDefined();
  });

  it('skips filter updates when map moves with geometry already selected', async () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    // First, select a geometry
    const selectEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      geometries: [
        {
          type: 'Polygon',
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
      ],
      eventType: 'draw',
      zoomLevel: 10,
    };

    await act(async () => {
      mockOnMapSelectionChange!(selectEvent);
    });

    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
    mockSetGeometryFilter.mockClear();

    // Act - now move the map (bounds event)
    const boundsEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [7.0, 36.0, 19.0, 48.0],
      eventType: 'bounds',
      zoomLevel: 11,
    };

    await act(async () => {
      mockOnMapSelectionChange!(boundsEvent);
    });

    // Assert - filter update should be skipped
    expect(mockSetGeometryFilter).not.toHaveBeenCalled();
  });

  it('updates filters when map moves without geometry selected', () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    // Act - move the map without any geometry selected
    const boundsEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [7.0, 36.0, 19.0, 48.0],
      eventType: 'bounds',
      zoomLevel: 11,
    };

    mockOnMapSelectionChange!(boundsEvent);

    // Assert - filter update should happen
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
  });

  it('updates filters immediately on geometry reset', async () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    // First, select a geometry
    const selectEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      geometries: [
        {
          type: 'Polygon',
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
      ],
      eventType: 'draw',
      zoomLevel: 10,
    };

    await act(async () => mockOnMapSelectionChange!(selectEvent));

    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
    mockSetGeometryFilter.mockClear();

    // Act - reset the geometry
    const resetEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      eventType: 'reset',
      zoomLevel: 10,
    };

    await act(async () => mockOnMapSelectionChange!(resetEvent));

    // Assert - filter update should happen immediately with bounding box
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
  });

  it('resumes filter updates after geometry reset when map moves', async () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    // First, select a geometry
    const selectEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      geometries: [
        {
          type: 'Polygon',
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
      ],
      eventType: 'draw',
      zoomLevel: 10,
    };

    await act(async () => mockOnMapSelectionChange!(selectEvent));

    // Reset the geometry
    const resetEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      eventType: 'reset',
      zoomLevel: 10,
    };

    await act(async () => mockOnMapSelectionChange!(resetEvent));

    mockSetGeometryFilter.mockClear();

    // Act - now move the map after reset
    const boundsEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [7.0, 36.0, 19.0, 48.0],
      eventType: 'bounds',
      zoomLevel: 11,
    };

    await act(async () => mockOnMapSelectionChange!(boundsEvent));

    // Assert - filter update should happen (geometry no longer selected)
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
  });

  it('updates filters when uploading new geometry while one is already selected', async () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    // First, select a geometry via draw
    const drawEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      geometries: [
        {
          type: 'Polygon',
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
      ],
      eventType: 'draw',
      zoomLevel: 10,
    };

    await act(async () => mockOnMapSelectionChange!(drawEvent));

    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
    mockSetGeometryFilter.mockClear();

    // Act - upload a new geometry
    const geometries = [
      {
        type: 'Polygon' as any,
        coordinates: [
          [
            [8.0, 37.0],
            [20.0, 37.0],
            [20.0, 49.0],
            [8.0, 49.0],
            [8.0, 37.0],
          ],
        ],
      },
    ];
    const uploadEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [8.0, 37.0, 20.0, 49.0],
      geometries,
      eventType: 'upload',
      zoomLevel: 11,
    };

    await act(async () => mockOnMapSelectionChange!(uploadEvent));

    // Assert - filter update should happen
    expect(mockSetGeometryFilter).toHaveBeenCalledTimes(1);
    const geometriesParam = mockSetGeometryFilter.mock.calls[0][0];
    expect(geometriesParam).toEqual(uploadEvent.geometries);
  });
});
