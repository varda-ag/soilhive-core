import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  // let's define the setDatasetFilters mock function here and export here down below
  // so that we can later grab it
  const mockSetDatasetFilters = jest.fn();

  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      setDatasetFilters: mockSetDatasetFilters,
    }),
    mockSetDatasetFilters,
  };
});

// grab the mock setDatasetFilters function that was passed to availability context
const { mockSetDatasetFilters } = jest.requireMock('../../src/contexts/AvailabilityContext');

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

  it('calls setDatasetFilters when map selection changes with geometries', () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    const mockEvent: SoilhiveMapSelectionChangeEvent = {
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
    };

    const onSelectionChange = mockOnMapSelectionChange;

    // Act
    onSelectionChange!(mockEvent);

    // Assert
    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(1);

    // the original setDatasetFilters is passed a function as an argument,
    // this is because it needs the previous value of datasetFilters
    expect(mockSetDatasetFilters).toHaveBeenCalledWith(expect.any(Function));

    // updaterFn is the function that was passed to setDatasetFilter in the original component and caught by
    // the mockSetDatasetFilters
    const updaterFn = mockSetDatasetFilters.mock.calls[0][0];
    const prevFilters = { parameters: 'data' };
    const result = updaterFn(prevFilters);

    // in this way we verify that just the geompetries are updated, but not the rest of the filters
    expect(result).toEqual({
      parameters: 'data',
      geometries: mockEvent.geometries,
    });
  });

  it('calls setDatasetFilters with bbox geometry when no geometries provided', () => {
    // Arrange
    __setIsDesktopLayout(true);
    render(<Homepage />);

    const mockEvent: SoilhiveMapSelectionChangeEvent = {
      bounds: [6.0, 35.0, 18.0, 47.0],
      // No geometries provided
    };

    // Act
    mockOnMapSelectionChange!(mockEvent);

    // Assert
    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(1);

    // setDatasetFilters receives a function as a parameter
    const updaterFn = mockSetDatasetFilters.mock.calls[0][0];
    const prevFilters = { parameters: 'data' };
    const result = updaterFn(prevFilters);

    // The geometry should be created from bboxPolygon
    expect(result).toHaveProperty('geometries');
    expect(result).toHaveProperty('parameters'); // make sure we don't delete the parameters property
    expect(result.geometries).toHaveLength(1);
    expect(result.geometries[0].type).toBe('Polygon');
    expect(result.geometries[0].coordinates).toBeDefined();
  });
});
