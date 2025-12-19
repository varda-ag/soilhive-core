import { fireEvent, render, screen } from '@testing-library/react';
import Homepage from '../../src/pages/Homepage';
import { __setIsDesktopLayout } from 'hooks/useDevice';

jest.mock('components/SoilhiveMap', () => {
  // Define the mock component with a name
  const MockSoilhiveMap = () => <div>Mock SoilhiveMap</div>;

  // The component name is inferred from the function name
  return MockSoilhiveMap;
});
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

describe('Homepage', () => {
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
});
