import { render, screen, within } from '@testing-library/react';
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
    { id: 'lc', name: 'Land Cover', enabled: true },
    { id: 'sg', name: 'Soil Groups', enabled: false },
    { id: 'az', name: 'Agroecological Zones', enabled: true },
  ];

  beforeEach(() => {
    (useRaster as jest.Mock).mockReturnValue({
      allCategories: mockCategories,
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
      const expectedKey = category.enabled ? 'Active' : 'Not active';
      expect(within(row).getByTestId('status-box')).toHaveTextContent(expectedKey);
    });
  });
});
