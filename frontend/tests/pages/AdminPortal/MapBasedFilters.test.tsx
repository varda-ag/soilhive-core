import { fireEvent, render, screen, within } from '@testing-library/react';
import { MapBasedFilters } from '../../../src/pages/AdminPortal/MapBasedFilters/MapBasedFilters';
import { useRaster } from 'hooks/useRaster';

jest.mock('components/UI/ExpandableText/ExpandableText', () => ({
  ExpandableText: ({ text }: { text: string }) => <div data-testid="mock-expandable-text">{text}</div>,
}));

jest.mock('hooks/useRaster', () => ({
  useRaster: jest.fn(),
}));

describe('MapBasedFilters page', () => {
  const mockCategories = [
    { id: 'lc', name: 'Land Cover', enabled: true, active: true },
    { id: 'sg', name: 'Soil Groups', enabled: false, active: false },
    { id: 'az', name: 'Agroecological Zones', enabled: true, active: false },
  ];

  const setCategoryActive = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRaster as jest.Mock).mockReturnValue({
      allCategories: mockCategories,
      setCategoryActive,
      isLoading: false,
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<MapBasedFilters />);
    expect(container).toMatchSnapshot();
  });

  it('renders the correct number of expandable descriptions', () => {
    render(<MapBasedFilters />);

    // We expect 3 instances in the current MapBasedFilters.tsx
    const mocks = screen.getAllByTestId('mock-expandable-text');
    expect(mocks).toHaveLength(3);

    // Verify specific content is passed to the mock
    expect(screen.getByText('Agroecological zones')).toBeInTheDocument();
    expect(screen.getByText('Land Cover')).toBeInTheDocument();
    expect(screen.getByText('Soil groups')).toBeInTheDocument();
  });

  it('renders the correct activation status for every category dynamically', () => {
    render(<MapBasedFilters />);

    mockCategories.forEach(category => {
      // Find the specific row for this category
      const row = screen.getByTestId(`status-row-${category.id}`);

      // Verify the name appears in the correct label slot
      expect(within(row).getByTestId('status-label')).toHaveTextContent(category.name);

      // Verify the status text matches the 'enabled' boolean logic
      const expectedKey = category.enabled ? 'Installed' : 'Not installed';
      expect(within(row).getByTestId('status-box')).toHaveTextContent(expectedKey);
    });
  });

  it('renders an activation toggle only for enabled categories, reflecting their active state', () => {
    render(<MapBasedFilters />);

    mockCategories.forEach(category => {
      const row = screen.getByTestId(`status-row-${category.id}`);
      const toggle = within(row).queryByRole('checkbox');

      if (category.enabled) {
        expect(toggle).toBeInTheDocument();
        if (category.active) {
          expect(toggle).toBeChecked();
        } else {
          expect(toggle).not.toBeChecked();
        }
      } else {
        expect(toggle).not.toBeInTheDocument();
      }
    });
  });

  it('calls setCategoryActive with the new checked state when a toggle is clicked', () => {
    render(<MapBasedFilters />);

    // 'lc' is enabled and active -> clicking it should deactivate it.
    const activeRow = screen.getByTestId('status-row-lc');
    fireEvent.click(within(activeRow).getByRole('checkbox'));
    expect(setCategoryActive).toHaveBeenCalledWith('lc', false);

    // 'az' is enabled and not active -> clicking it should activate it.
    const inactiveRow = screen.getByTestId('status-row-az');
    fireEvent.click(within(inactiveRow).getByRole('checkbox'));
    expect(setCategoryActive).toHaveBeenCalledWith('az', true);
  });
});
