import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsListItem } from 'components/DatasetsSidebar/DatasetsList/DatasetsListItem/DatasetsListItem';
import useAvailability from 'hooks/useAvailability';

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
  dataType: 'point',
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
});
