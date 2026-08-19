import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsListItem } from 'components/DatasetsSidebar/DatasetsList/DatasetsListItem/DatasetsListItem';
import useAvailability from 'hooks/useAvailability';
import { Capability } from 'types/backend';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/UI', () => ({
  __esModule: true,
  Checkbox: ({ label, value, onChange }: any) => (
    <div data-testid="mock-checkbox" data-checked={value} onClick={onChange}>
      {label}
    </div>
  ),
  Button: ({ children, href }: any) => (
    <a data-testid="mock-button" href={href} target={href ? '_blank' : undefined} rel={href ? 'noreferrer' : undefined}>
      {children}
    </a>
  ),
  Tag: ({ text, type }: any) => (
    <span data-testid={`tag-${text}`} data-type={type}>
      {text}
    </span>
  ),
}));

const mockDataset = {
  id: 'dataset-1',
  name: 'SoilGrid Global',
  views: '12.3k',
  tags: ['Global', 'Primary'],
  visibility: 'public',
  dataType: 'point',
  capabilities: [Capability.DOWNLOAD],
  properties: {
    points: 34546,
    layers: 12,
    minDepth: 0,
    maxDepth: 60,
    dateStart: 2012,
    dateEnd: 2024,
  },
};

describe('DatasetsListItem', () => {
  const mockSelectDataset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAvailability as jest.Mock).mockReturnValue({
      selectedDatasets: ['dataset-1'],
      selectDataset: mockSelectDataset,
    });
  });

  it('renders main dataset info', () => {
    const { container } = render(<DatasetsListItem dataset={mockDataset} />);

    expect(screen.getByTestId('sh-datasets-list-item')).toBeInTheDocument();
    expect(screen.getByTestId('mock-checkbox')).toHaveTextContent('SoilGrid Global');
    expect(screen.getByTestId('mock-button')).toHaveTextContent('Metadata');

    expect(container).toMatchSnapshot();
  });

  it('renders private tag for private datasets', () => {
    render(<DatasetsListItem dataset={{ ...mockDataset, visibility: 'private' }} />);

    expect(screen.getByTestId('tag-Private')).not.toHaveAttribute('data-type');
  });

  it('renders tags with correct types', () => {
    render(<DatasetsListItem dataset={mockDataset} />);

    expect(screen.getByTestId('tag-Global')).not.toHaveAttribute('data-type');
    expect(screen.getByTestId('tag-Primary')).toHaveAttribute('data-type', 'primary');
  });

  it('checkbox reflects selection state', () => {
    render(<DatasetsListItem dataset={mockDataset} />);

    expect(screen.getByTestId('mock-checkbox')).toHaveAttribute('data-checked', 'true');
  });

  it('checkbox triggers dataset selection callback', () => {
    render(<DatasetsListItem dataset={mockDataset} />);

    fireEvent.click(screen.getByTestId('mock-checkbox'));
    expect(mockSelectDataset).toHaveBeenCalledWith('dataset-1');
  });

  it('dropdown toggles open state when arrow is clicked', () => {
    const { container } = render(<DatasetsListItem dataset={mockDataset} />);

    const item = screen.getByTestId('sh-datasets-list-item');
    const arrow = container.querySelector('.DropdownIcon') as Element;

    expect(item.className).not.toContain('Opened');

    fireEvent.click(arrow);
    expect(item.className).toContain('Opened');

    fireEvent.click(arrow);
    expect(item.className).not.toContain('Opened');
  });

  it('metadata button links to dataset page in a new tab', () => {
    render(<DatasetsListItem dataset={mockDataset} />);

    const btn = screen.getByTestId('mock-button');
    expect(btn).toHaveAttribute('href', '/datasets/dataset-1');
    expect(btn).toHaveAttribute('target', '_blank');
    expect(btn).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders metadata details', () => {
    render(<DatasetsListItem dataset={mockDataset} />);

    expect(screen.getByText('34546 points')).toBeInTheDocument();
    expect(screen.getByText('0-60 cm')).toBeInTheDocument();
    expect(screen.getByText('2012 - 2024')).toBeInTheDocument();
  });

  it('renders a selectable checkbox for a private dataset with the download capability', () => {
    render(<DatasetsListItem dataset={{ ...mockDataset, visibility: 'private', capabilities: [Capability.DOWNLOAD] }} />);

    expect(screen.getByTestId('mock-checkbox')).toBeInTheDocument();
    expect(screen.queryByText(mockDataset.name, { selector: 'p' })).not.toBeInTheDocument();
  });

  it('suppresses the checkbox and renders fallback text for a private dataset without the download capability', () => {
    render(<DatasetsListItem dataset={{ ...mockDataset, visibility: 'private', capabilities: [] }} />);

    expect(screen.queryByTestId('mock-checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(mockDataset.name, { selector: 'p' })).toBeInTheDocument();
  });

  it('renders a selectable checkbox for a public dataset with no capabilities field (old backend response)', () => {
    const { capabilities: _capabilities, ...datasetWithoutCapabilities } = mockDataset;
    render(<DatasetsListItem dataset={{ ...datasetWithoutCapabilities, visibility: 'public' }} />);

    expect(screen.getByTestId('mock-checkbox')).toBeInTheDocument();
    expect(screen.queryByText(mockDataset.name, { selector: 'p' })).not.toBeInTheDocument();
  });

  it('suppresses the checkbox for a private dataset with no capabilities field (old backend response)', () => {
    const { capabilities: _capabilities, ...datasetWithoutCapabilities } = mockDataset;
    render(<DatasetsListItem dataset={{ ...datasetWithoutCapabilities, visibility: 'private' }} />);

    expect(screen.queryByTestId('mock-checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(mockDataset.name, { selector: 'p' })).toBeInTheDocument();
  });
});
