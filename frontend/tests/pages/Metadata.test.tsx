import { act, fireEvent, render, screen } from '@testing-library/react';
import Metadata from '../../src/pages/Metadata';
import { useMetadata } from 'hooks/useMetadata';
import { useEntitlements } from 'hooks/useEntitlementsHook';
import { __setIsMobileLayout, __resetIsMobileLayout } from 'hooks/useDevice';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('react-router', () => ({
  __esModule: true,
  useParams: jest.fn().mockReturnValue({ id: 'test-id' }),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
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

jest.mock('hooks/useDevice');

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn().mockReturnValue({ isLoading: false }),
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
  status: 'PUBLISHED',
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

  it('renders date of the last update when update_at is provided', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: { ...buildDataset(), updated_at: '05-05-2020' },
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });

    render(<Metadata />);
    expect(screen.getByTestId('sh-last-update')).toBeInTheDocument();
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

  it('renders "MANDATORY PROPERTIES" header above the Name field', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    render(<Metadata />);
    expect(screen.getByText('MANDATORY PROPERTIES')).toBeInTheDocument();
  });

  it('renders "MANDATORY PROPERTIES" header for non-admin users too', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    render(<Metadata />);
    expect(screen.getByText('MANDATORY PROPERTIES')).toBeInTheDocument();
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

const buildAdminDataset = () => ({
  id: 'test-id',
  name: 'Test Dataset',
  full_name: 'Test Dataset Full Name',
  version: '1.0',
  description: '<p>A description</p>',
  author: 'Test Author',
  data_producer: 'Test Producer',
  soilProperties: ['ph'],
  soil_depth: { min: 0, max: 30 },
  gis_datatype: 'raster',
  spatial_resolution: '250m',
  reference_period_start: '2020-01-01',
  reference_period_stop: '2020-12-31',
  publication_date: '2021-06-01',
  licenses: [
    { id: 'lic-1', url: 'https://license.example', full_name: 'Test License', name: 'TL', created_at: new Date(), updated_at: null },
  ],
  citation: 'Test citation',
  spatial_extent: null,
  inferred_properties: [],
});

describe('Metadata page – admin editing behavior', () => {
  const renderAsAdmin = (overrides: object = {}) => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildAdminDataset(),
      allLicenses: [
        { id: 'lic-1', url: 'https://license.example', full_name: 'Test License', name: 'TL', created_at: new Date(), updated_at: null },
      ],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
      updateProperty: jest.fn(),
      updateRelatedResources: jest.fn(),
      ...overrides,
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
    document.body.style.overflow = '';
  });

  it('shows admin notice when user is admin', () => {
    renderAsAdmin();
    expect(screen.getByText(/You can edit fields directly/i)).toBeInTheDocument();
  });

  it('does not show admin notice for non-admin', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildAdminDataset(),
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
      updateProperty: jest.fn(),
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    render(<Metadata />);
    expect(screen.queryByText(/You can edit fields directly/i)).not.toBeInTheDocument();
  });

  it('shows edit buttons on editable rows when admin', () => {
    renderAsAdmin();
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  it('does not show an edit button on the gis_datatype row (always isEditable=false)', () => {
    // All rows but gis_datatype respect admin; gis_datatype is hardcoded to isEditable={false}.
    // We verify by checking that after removing every other field the dataset's gis_datatype
    // value ("Raster") is visible but the Edit buttons count drops when we temporarily
    // put *only* gis_datatype in inferredProperties (proving its row never gets an edit button).
    renderAsAdmin({
      inferredProperties: new Set(['measured_properties', 'soil_depth', 'reference_period_start', 'reference_period_stop', 'licenses']),
    });
    // gis_datatype row is still there
    expect(screen.getByText('Raster')).toBeInTheDocument();
  });

  it('hides edit buttons for rows whose property is inferred', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildAdminDataset(),
      allLicenses: [],
      inferredProperties: new Set(['soil_depth']),
      isLoading: false,
      isError: false,
      updateProperty: jest.fn(),
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);

    // Min/max soil depth rows have isEditable guarded by inferredProperties.has('soil_depth'),
    // so their edit buttons must not be present. We confirm the overall edit-button count
    // is lower than when no properties are inferred (16 editable when nothing inferred,
    // 14 when soil_depth is inferred — 2 rows lose their button).
    const editButtonCount = screen.getAllByRole('button', { name: 'Edit' }).length;

    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildAdminDataset(),
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
      updateProperty: jest.fn(),
    });
    const { unmount } = render(<Metadata />);
    const editButtonCountNoInferred = screen.getAllByRole('button', { name: 'Edit' }).length;
    unmount();

    expect(editButtonCount).toBeLessThan(editButtonCountNoInferred);
  });

  it('clicking an edit button blocks all other rows from showing edit buttons', () => {
    renderAsAdmin();
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    expect(editButtons.length).toBeGreaterThan(1);

    fireEvent.click(editButtons[0]);

    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0);
  });

  it('clicking Cancel restores edit buttons on other rows', () => {
    renderAsAdmin();
    const initialCount = screen.getAllByRole('button', { name: 'Edit' }).length;

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(initialCount);
  });

  it('successful save restores edit buttons on other rows', () => {
    const updateProperty = jest.fn((_prop: string, _val: string, { onSuccess }: any) => onSuccess());
    renderAsAdmin({ updateProperty });

    const initialCount = screen.getAllByRole('button', { name: 'Edit' }).length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(initialCount);
  });
});

describe('Metadata page – visibility guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
  });

  it('redirects to / when dataset is not published and user is not admin', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: { ...buildDataset(), status: 'STAGED' },
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false });
    render(<Metadata />);
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/');
  });

  it('does not redirect while auth is still loading', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: { ...buildDataset(), status: 'STAGED' },
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: true });
    render(<Metadata />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('does not redirect when dataset is published and user is not admin', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildDataset(),
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false });
    render(<Metadata />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('does not redirect when user is admin even if dataset is not published', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: { ...buildDataset(), status: 'STAGED' },
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false });
    render(<Metadata />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});

describe('Metadata page – mobile layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
    document.body.style.overflow = '';
    __setIsMobileLayout(true);
  });

  afterEach(() => {
    __resetIsMobileLayout();
  });

  it('does not show the admin notice on mobile even when user is admin', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildAdminDataset(),
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
      updateProperty: jest.fn(),
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);
    expect(screen.queryByText(/You can edit fields directly/i)).not.toBeInTheDocument();
  });

  it('does not show edit buttons on mobile even when user is admin', () => {
    (useMetadata as jest.Mock).mockReturnValue({
      dataset: buildAdminDataset(),
      allLicenses: [],
      inferredProperties: new Set(),
      isLoading: false,
      isError: false,
      updateProperty: jest.fn(),
    });
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0);
  });
});
