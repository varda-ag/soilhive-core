import { act, fireEvent, render, screen } from '@testing-library/react';
import Metadata from '../../src/pages/Metadata';
import { useMetadata } from 'hooks/useMetadata';

jest.mock('react-router', () => ({
  __esModule: true,
  useParams: jest.fn().mockReturnValue({ id: 'test-id' }),
}));

jest.mock('hooks/useMetadata', () => ({
  useMetadata: jest.fn(),
}));

jest.mock('hooks/useEntitlementsHook', () => ({
  __esModule: true,
  ADMIN_PORTAL_ACCESS: 0,
  useEntitlements: jest.fn().mockReturnValue({ can: () => false }),
}));

jest.mock('components/Map/SoilhiveSimpleMap', () => {
  const MockSoilhiveSimpleMap = () => <div data-testid="mock-map" />;
  return MockSoilhiveSimpleMap;
});

jest.mock('components/Logo/Logo', () => ({
  Logo: () => <div data-testid="mock-logo" />,
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useCreateLicenseMutation: jest.fn().mockReturnValue({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ showNotification: jest.fn(), removeNotification: jest.fn(), notifications: [] }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: jest.fn().mockReturnValue({ invalidateQueries: jest.fn() }),
}));

jest.mock('utilities/buildMetadataHead', () => ({
  getMetadataHeadValues: jest.fn().mockReturnValue({
    title: 'Test Title',
    description: 'Test Description',
    siteName: 'Test Site',
    url: 'https://test.example/',
    image: 'https://test.example/img.png',
  }),
}));

const buildDataset = () => ({
  id: 'test-id',
  name: 'Test Dataset',
  full_name: 'Test Dataset Full Name',
  version: '1.0.0',
  description: 'A test dataset description',
  author: 'Test Author',
  data_producer: 'Test Producer',
  soilProperties: ['ph', 'organic_carbon'],
  soil_depth: { min: 0, max: 30 },
  gis_datatype: 'raster',
  spatial_resolution: '250m',
  reference_period_start: '2020-01-01',
  reference_period_stop: '2020-12-31',
  publication_date: '2021-06-01',
  licenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
  citation: 'Test citation',
  spatial_extent: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
});

describe('Metadata page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
    document.body.style.overflow = '';
  });

  it('renders loading state', () => {
    (useMetadata as jest.Mock).mockReturnValue({ dataset: undefined, isLoading: true, isError: false });
    render(<Metadata />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    (useMetadata as jest.Mock).mockReturnValue({ dataset: undefined, isLoading: false, isError: true });
    render(<Metadata />);
    expect(screen.getByText('Failed to load dataset.')).toBeInTheDocument();
  });

  it('renders dataset content and matches snapshot', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    const { container } = render(<Metadata />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('upserts document title and meta tags from dataset name', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    render(<Metadata />);

    expect(document.title).toBe('Test Title');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Test Description');
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Test Title');
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe('https://test.example/img.png');
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary');
    expect(document.head.querySelector('meta[name="twitter:description"]')?.getAttribute('content')).toBe('Test Description');
  });

  it('copies the current URL to the clipboard when "Copy link" is selected', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    const writeText = jest.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<Metadata />);

    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
    fireEvent.click(screen.getByText('Copy link'));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('triggers a mailto navigation when "Share by email" is selected', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    // jsdom forbids redefining window.location, and its navigation setter only logs a
    // "not implemented" warning to the virtual console. Capture that log to prove the
    // handler attempted to navigate, and assert the popover closes (proving onSelect ran).
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(<Metadata />);

      fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
      expect(screen.getByTestId('sh-ui-splitbutton-popover')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Share by email'));

      const flat = errorSpy.mock.calls.flat();
      const serialized = flat.map(a => (a instanceof Error ? a.message : String(a))).join(' | ');
      expect(serialized).toMatch(/not implemented/i);
      expect(serialized).toMatch(/navigation/i);
      expect(screen.queryByTestId('sh-ui-splitbutton-popover')).not.toBeInTheDocument();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('opens map popup on overlay click and closes it on Escape', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    render(<Metadata />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      screen.getByLabelText('View map').click();
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes the map popup when the backdrop is clicked', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    render(<Metadata />);

    act(() => {
      screen.getByLabelText('View map').click();
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    act(() => {
      fireEvent.click(dialog);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
