import React from 'react';
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import Availability from '../../src/pages/Availability';
import { __setIsDesktopLayout } from 'hooks/useDevice';
import type { SoilhiveMapSelectionChangeEvent } from 'components/Map/SoilhiveMapSelectionChangeEvent';
import { parseGeoJSONFile } from '../../src/utilities/parseGeoJSONFile';
import useNotifications from 'hooks/useNotifications';

let mockOnMapSelectionChange: ((event: any) => void) | undefined;
const mockOnUpload = jest.fn();
const mockShowNotification = jest.fn();

/* eslint-disable react-hooks/globals */
jest.mock('components/Map/SoilhiveMap', () => {
  const MockSoilhiveMap = React.forwardRef(function SoilhiveMap({ onSelectionChange, children, footer }: any, ref: any) {
    mockOnMapSelectionChange = onSelectionChange;
    React.useImperativeHandle(ref, () => ({ onUpload: mockOnUpload }));
    return (
      <div data-test-id="mock-soilhive-map">
        Mock SoilhiveMap
        {children}
        {footer}
      </div>
    );
  });
  return MockSoilhiveMap;
});
/* eslint-enable react-hooks/globals */

jest.mock('components/Map/AreaInfo', () => ({
  AreaInfoPopup: ({ onClose, locationName }: any) => (
    <div data-testid="mock-area-info-popup">
      Mock AreaInfoPopup - {locationName}
      <button onClick={onClose}>Close AreaInfoPopup</button>
    </div>
  ),
  AreaInfoBar: ({ onClose, locationName }: any) => (
    <div data-testid="mock-area-info-bar">
      Mock AreaInfoBar - {locationName}
      <button onClick={onClose}>Close AreaInfoBar</button>
    </div>
  ),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({
    isLoadingThemeConfig: false,
    themeConfig: { daiConfig: { isEnabled: false, defaultValue: false } },
  }),
}));

jest.mock('hooks/useDai', () => ({
  useDai: jest.fn().mockReturnValue({ dai: null, isLoading: false }),
}));

jest.mock('../../src/utilities/parseGeoJSONFile', () => ({
  parseGeoJSONFile: jest.fn(),
}));

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn(),
}));

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
  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      availableDatasets: [{ id: 'test-dataset' }],
    }),
  };
});

jest.mock('../../src/contexts/AvailabilityMapContext', () => {
  // let's define the mock functions here and export them here down below
  // so that we can later grab them
  const mockSetGeometryFilter = jest.fn();
  const mockSetSelectedPoint = jest.fn();
  const mockSetIsDaiEnabled = jest.fn();
  const mockSetDaiOpacity = jest.fn();

  const mockContextValue = {
    boundingBox: [0, 0, 0, 0],
    setGeometryFilter: mockSetGeometryFilter,
    setBoundingBox: jest.fn(),
    setLocationName: jest.fn(),
    setSelectionType: jest.fn(),
    // Fields SoilhiveMap itself used to read directly from this context — now passed through
    // Availability.tsx as `selectionState`, and also used by Availability.tsx's own info-card
    // composition (isAreaInfoVisible, AreaInfoPopup/AreaInfoBar).
    selectedPoint: null,
    setSelectedPoint: mockSetSelectedPoint,
    selectedH3Cell: null,
    setSelectedH3Cell: jest.fn(),
    h3Cells: null,
    setH3Cells: jest.fn(),
    selection: { type: 'FeatureCollection', features: [] },
    setSelection: jest.fn(),
    showDrawControl: false,
    setShowDrawControl: jest.fn(),
    showSelectionToolbar: false,
    setShowSelectionToolbar: jest.fn(),
    isDaiEnabled: false,
    setIsDaiEnabled: mockSetIsDaiEnabled,
    daiOpacity: 80,
    setDaiOpacity: mockSetDaiOpacity,
    locationName: undefined,
  };

  return {
    __esModule: true,
    AvailabilityMapContext: React.createContext(mockContextValue),
    mockContextValue,
    mockSetGeometryFilter,
    mockSetSelectedPoint,
    mockSetIsDaiEnabled,
    mockSetDaiOpacity,
  };
});

// grab the mocked context and its mock functions
const { AvailabilityMapContext, mockContextValue, mockSetGeometryFilter, mockSetSelectedPoint } = jest.requireMock(
  '../../src/contexts/AvailabilityMapContext',
);

describe('Availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotifications as jest.Mock).mockReturnValue({ showNotification: mockShowNotification });
  });

  it('renders availability page on desktop', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Availability />);
    expect(container).toMatchSnapshot();
  });

  it('closes DatasetsSidebar by clicking on the close button in the sidebar', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Availability />);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(screen.getByText('Close DatasetsSidebar'));

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'false');
    expect(container.querySelector('.DatasetsButton') as Element).toBeInTheDocument();
  });

  it('reopens DatasetsSidebar by clicking on the DatasetsButton availability page', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Availability />);

    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(screen.getByText('Close DatasetsSidebar'));
    const datasetsButton = container.querySelector('.DatasetsButton') as Element;
    fireEvent.click(datasetsButton);

    expect(datasetsButton).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-datasets-sidebar')).toHaveAttribute('data-opened', 'true');
  });

  it('opens FilteringSidebar by clicking on the FiltersButton availability page', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Availability />);

    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'false');

    const filtersButton = container.querySelector('.FiltersButton') as Element;
    fireEvent.click(filtersButton);

    expect(filtersButton).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'true');
  });

  it('closes FilteringSidebar by clicking on the close button in the sidebar', () => {
    __setIsDesktopLayout(true);
    const { container } = render(<Availability />);

    fireEvent.click(container.querySelector('.FiltersButton') as Element);

    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'true');

    fireEvent.click(screen.getByText('Close FilteringSidebar'));

    expect(screen.getByTestId('mock-filtering-sidebar')).toHaveAttribute('data-opened', 'false');
    expect(container.querySelector('.FiltersButton') as Element).toBeInTheDocument();
  });

  it('renders availability page on mobile', () => {
    __setIsDesktopLayout(false);
    const { container } = render(<Availability />);
    expect(container).toMatchSnapshot();
  });

  it('changes tabs by clicking on mobile navigation', () => {
    __setIsDesktopLayout(false);
    render(<Availability />);

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
    render(<Availability />);

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
      selectionType: 'drawn-polygon',
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
    render(<Availability />);

    const mockEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      // No geometries provided
      selectionType: 'drawn-polygon',
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

  describe('info card composition', () => {
    it('shows AreaInfoPopup (not AreaInfoBar) on desktop when a point is selected, and closing it clears the selection', () => {
      __setIsDesktopLayout(true);
      render(
        <AvailabilityMapContext.Provider value={{ ...mockContextValue, selectedPoint: { lng: 1, lat: 2 }, showDrawControl: false }}>
          <Availability />
        </AvailabilityMapContext.Provider>,
      );

      expect(screen.getByTestId('mock-area-info-popup')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-area-info-bar')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Close AreaInfoPopup'));
      expect(mockSetSelectedPoint).toHaveBeenCalledWith(null);
    });

    it('shows AreaInfoBar (not AreaInfoPopup) on mobile when a point is selected, and closing it clears the selection', () => {
      __setIsDesktopLayout(false);
      render(
        <AvailabilityMapContext.Provider value={{ ...mockContextValue, selectedPoint: { lng: 1, lat: 2 }, showDrawControl: false }}>
          <Availability />
        </AvailabilityMapContext.Provider>,
      );

      expect(screen.getByTestId('mock-area-info-bar')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-area-info-popup')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Close AreaInfoBar'));
      expect(mockSetSelectedPoint).toHaveBeenCalledWith(null);
    });

    it('shows neither AreaInfoPopup nor AreaInfoBar while drawing, even if a point was previously selected', () => {
      __setIsDesktopLayout(true);
      render(
        <AvailabilityMapContext.Provider value={{ ...mockContextValue, selectedPoint: { lng: 1, lat: 2 }, showDrawControl: true }}>
          <Availability />
        </AvailabilityMapContext.Provider>,
      );

      expect(screen.queryByTestId('mock-area-info-popup')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-area-info-bar')).not.toBeInTheDocument();
    });

    it('shows neither AreaInfoPopup nor AreaInfoBar when no point is selected', () => {
      __setIsDesktopLayout(true);
      render(<Availability />);

      expect(screen.queryByTestId('mock-area-info-popup')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-area-info-bar')).not.toBeInTheDocument();
    });
  });

  describe('drag and drop', () => {
    function getRoot(container: HTMLElement) {
      return container.firstChild as HTMLElement;
    }

    it('shows the drop overlay when a file is dragged over the container', () => {
      const { container } = render(<Availability />);
      expect(container.querySelector('.soilhive-map-drop-overlay')).not.toBeInTheDocument();

      fireEvent.dragEnter(getRoot(container));

      expect(container.querySelector('.soilhive-map-drop-overlay')).toBeInTheDocument();
    });

    it('hides the drop overlay when drag leaves the container', () => {
      const { container } = render(<Availability />);

      fireEvent.dragEnter(getRoot(container));
      expect(container.querySelector('.soilhive-map-drop-overlay')).toBeInTheDocument();

      fireEvent.dragLeave(getRoot(container));
      expect(container.querySelector('.soilhive-map-drop-overlay')).not.toBeInTheDocument();
    });

    it('hides the drop overlay when a file is dropped', async () => {
      (parseGeoJSONFile as jest.Mock).mockResolvedValue({
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      });
      const { container } = render(<Availability />);
      const root = getRoot(container);

      fireEvent.dragEnter(root);
      expect(container.querySelector('.soilhive-map-drop-overlay')).toBeInTheDocument();

      const file = new File(['{}'], 'region.geojson', { type: 'application/json' });
      const dropEvent = createEvent.drop(root);
      Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });

      await act(async () => {
        fireEvent(root, dropEvent);
      });

      expect(container.querySelector('.soilhive-map-drop-overlay')).not.toBeInTheDocument();
    });

    it('calls onUpload with the parsed polygon when a valid file is dropped', async () => {
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      };
      (parseGeoJSONFile as jest.Mock).mockResolvedValue({ polygon });
      const { container } = render(<Availability />);
      const root = getRoot(container);

      const file = new File(['{}'], 'region.geojson', { type: 'application/json' });
      const dropEvent = createEvent.drop(root);
      Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });

      await act(async () => {
        fireEvent(root, dropEvent);
      });

      expect(mockOnUpload).toHaveBeenCalledTimes(1);
      expect(mockOnUpload).toHaveBeenCalledWith(polygon);
    });

    it('calls showNotification when the dropped file fails to parse', async () => {
      (parseGeoJSONFile as jest.Mock).mockResolvedValue({
        error: { id: 'parse-error', message: 'Invalid GeoJSON' },
      });
      const { container } = render(<Availability />);
      const root = getRoot(container);

      const file = new File(['invalid'], 'bad.geojson', { type: 'application/json' });
      const dropEvent = createEvent.drop(root);
      Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } });

      await act(async () => {
        fireEvent(root, dropEvent);
      });

      expect(mockShowNotification).toHaveBeenCalledTimes(1);
      expect(mockShowNotification).toHaveBeenCalledWith({
        id: 'parse-error',
        title: 'Upload failed',
        message: 'Invalid GeoJSON',
      });
      expect(mockOnUpload).not.toHaveBeenCalled();
    });

    it('does not call onUpload when no file is present in the drop event', async () => {
      const { container } = render(<Availability />);
      const root = getRoot(container);

      const dropEvent = createEvent.drop(root);
      Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [] } });

      await act(async () => {
        fireEvent(root, dropEvent);
      });

      expect(parseGeoJSONFile).not.toHaveBeenCalled();
      expect(mockOnUpload).not.toHaveBeenCalled();
    });
  });
});
