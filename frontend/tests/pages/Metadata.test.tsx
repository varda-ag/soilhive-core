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

const mockShowNotification = jest.fn();
jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    showNotification: mockShowNotification,
    removeNotification: jest.fn(),
    notifications: [],
  })),
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

// ---------------------------------------------------------------------------
// Shared data builders
// ---------------------------------------------------------------------------

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

/** Returns the minimal useMetadata mock that lets the full page render without crashing. */
const baseHookMock = (overrides: object = {}) => ({
  dataset: undefined,
  allLicenses: [],
  inferredProperties: new Set(),
  isLoading: false,
  isError: false,
  handleFieldChange: jest.fn(),
  fieldErrors: new Set<string>(),
  validate: jest.fn().mockReturnValue(true),
  saveAll: jest.fn(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Non-admin / public-facing page
// ---------------------------------------------------------------------------

describe('Metadata page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
    document.body.style.overflow = '';
  });

  it('renders loading state', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ isLoading: true }));
    render(<Metadata />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ isError: true }));
    render(<Metadata />);
    expect(screen.getByText('Failed to load dataset.')).toBeInTheDocument();
  });

  it('renders dataset content and matches snapshot', () => {
    (useMetadata as jest.Mock).mockReturnValue(
      baseHookMock({
        dataset: buildDataset(),
        allLicenses: [{ id: 'lic-1', url: 'https://license.example', full_name: 'Test License' }],
      }),
    );
    const { container } = render(<Metadata />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders date of the last update when updated_at is provided', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: { ...buildDataset(), updated_at: '05-05-2020' } }));
    render(<Metadata />);
    expect(screen.getByTestId('sh-last-update')).toBeInTheDocument();
  });

  it('upserts document title and meta tags from dataset name', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    render(<Metadata />);
    expect(document.title).toBe('Test Title');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Test Description');
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Test Title');
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe('https://test.example/img.png');
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary');
    expect(document.head.querySelector('meta[name="twitter:description"]')?.getAttribute('content')).toBe('Test Description');
  });

  it('copies the current URL to the clipboard when "Copy link" is selected', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    const writeText = jest.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<Metadata />);
    fireEvent.click(screen.getByTestId('sh-ui-splitbutton-toggle'));
    fireEvent.click(screen.getByText('Copy link'));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('triggers a mailto navigation when "Share by email" is selected', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
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

  it('does not render the mandatory-fields legend for non-admin users', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    render(<Metadata />);
    expect(screen.queryByTestId('sh-mandatory-fields')).not.toBeInTheDocument();
  });

  it('does not render label asterisks for non-admin users', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    const { container } = render(<Metadata />);
    expect(container.querySelector('sup')).not.toBeInTheDocument();
  });

  it('does not render the Save button for non-admin users', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    render(<Metadata />);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('opens map popup on overlay click and closes it on Escape', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
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
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    render(<Metadata />);

    act(() => {
      screen.getByLabelText('View map').click();
    });
    const dialog = screen.getByRole('dialog');
    act(() => {
      fireEvent.click(dialog);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the spatial_resolution row when gis_datatype is raster', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    render(<Metadata />);
    expect(screen.getByText('Spatial resolution:')).toBeInTheDocument();
    expect(screen.getByText('250m')).toBeInTheDocument();
  });

  it('hides the spatial_resolution row when gis_datatype is not raster', () => {
    (useMetadata as jest.Mock).mockReturnValue(
      baseHookMock({ dataset: { ...buildDataset(), gis_datatype: 'point', spatial_resolution: '250m' } }),
    );
    render(<Metadata />);
    expect(screen.queryByText('Spatial resolution:')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Admin editing behaviour
// ---------------------------------------------------------------------------

describe('Metadata page – admin editing behavior', () => {
  const mockValidate = jest.fn().mockReturnValue(true);
  const mockSaveAll = jest.fn();
  const mockHandleFieldChange = jest.fn();

  const renderAsAdmin = (overrides: object = {}) => {
    (useMetadata as jest.Mock).mockReturnValue(
      baseHookMock({
        dataset: buildAdminDataset(),
        allLicenses: [
          { id: 'lic-1', url: 'https://license.example', full_name: 'Test License', name: 'TL', created_at: new Date(), updated_at: null },
        ],
        handleFieldChange: mockHandleFieldChange,
        fieldErrors: new Set<string>(),
        validate: mockValidate,
        saveAll: mockSaveAll,
        ...overrides,
      }),
    );
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
    document.body.style.overflow = '';
    mockValidate.mockReturnValue(true);
    mockSaveAll.mockReset();
    mockShowNotification.mockReset();
  });

  const getRowLabel = (label: string) => Array.from(document.querySelectorAll('p > strong')).find(el => el.textContent?.startsWith(label));

  it('shows the mandatory-fields legend when user is admin', () => {
    renderAsAdmin();
    const legend = screen.getByTestId('sh-mandatory-fields');
    expect(legend).toBeInTheDocument();
    expect(legend).toHaveTextContent('Mandatory properties');
  });

  it('does not show the mandatory-fields legend for non-admin', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildAdminDataset() }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    render(<Metadata />);
    expect(screen.queryByTestId('sh-mandatory-fields')).not.toBeInTheDocument();
  });

  it('marks required row labels with an asterisk when admin', () => {
    renderAsAdmin();
    expect(getRowLabel('Name:')?.querySelector('sup')).toHaveTextContent('*');
    expect(getRowLabel('Full name:')?.querySelector('sup')).toHaveTextContent('*');
    expect(getRowLabel('Author:')?.querySelector('sup')).toHaveTextContent('*');
    expect(getRowLabel('Publication date:')?.querySelector('sup')).toHaveTextContent('*');
    expect(getRowLabel('Description:')?.querySelector('sup')).toHaveTextContent('*');
    expect(getRowLabel('License:')?.querySelector('sup')).toHaveTextContent('*');
  });

  it('does not mark inferred properties as required', () => {
    renderAsAdmin({
      inferredProperties: new Set(['soil_depth', 'licenses', 'reference_period_start', 'reference_period_stop']),
    });
    expect(getRowLabel('Min Soil Depth (cm):')?.querySelector('sup')).toBeFalsy();
    expect(getRowLabel('Max Soil Depth (cm):')?.querySelector('sup')).toBeFalsy();
    expect(getRowLabel('Reference coverage start:')?.querySelector('sup')).toBeFalsy();
    expect(getRowLabel('Reference coverage end:')?.querySelector('sup')).toBeFalsy();
    expect(getRowLabel('License:')?.querySelector('sup')).toBeFalsy();
    expect(getRowLabel('Name:')?.querySelector('sup')).toHaveTextContent('*');
  });

  it('renders a single Save button for admins', () => {
    renderAsAdmin();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('Save button is enabled when fieldErrors is empty', () => {
    renderAsAdmin({ fieldErrors: new Set() });
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  });

  it('Save button is disabled when fieldErrors has items', () => {
    renderAsAdmin({ fieldErrors: new Set(['name']) });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not show FormMessage when fieldErrors is empty', () => {
    renderAsAdmin({ fieldErrors: new Set() });
    expect(screen.queryByText('Please fill in all required fields before saving')).not.toBeInTheDocument();
  });

  it('shows FormMessage when fieldErrors has items', () => {
    renderAsAdmin({ fieldErrors: new Set(['name', 'author']) });
    expect(screen.getByText('Please fill in all required fields before saving')).toBeInTheDocument();
  });

  it('calls validate() when Save is clicked', () => {
    renderAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockValidate).toHaveBeenCalledTimes(1);
  });

  it('does not call saveAll when validate returns false', () => {
    mockValidate.mockReturnValue(false);
    renderAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSaveAll).not.toHaveBeenCalled();
  });

  it('calls saveAll when validate returns true', () => {
    mockValidate.mockReturnValue(true);
    renderAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSaveAll).toHaveBeenCalledTimes(1);
  });

  it('shows success notification on successful save', () => {
    mockSaveAll.mockImplementation(({ onSuccess }: any) => onSuccess());
    renderAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Changes saved successfully' }));
  });

  it('shows error notification on failed save', () => {
    const err = new Error('Network error');
    mockSaveAll.mockImplementation(({ onError }: any) => onError(err));
    renderAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockShowNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', title: 'Failed to save', message: 'Network error' }),
    );
  });

  it('shows "Saving…" label and disables Save button while saving', () => {
    // saveAll that never calls callbacks simulates an in-flight request
    mockSaveAll.mockImplementation(() => {});
    renderAsAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Visibility guard
// ---------------------------------------------------------------------------

describe('Metadata page – visibility guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.title = '';
  });

  it('redirects to / when dataset is not published and user is not admin', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: { ...buildDataset(), status: 'STAGED' } }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false });
    render(<Metadata />);
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/');
  });

  it('does not redirect while auth is still loading', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: { ...buildDataset(), status: 'STAGED' } }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: true });
    render(<Metadata />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('does not redirect when dataset is published and user is not admin', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildDataset() }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => false });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false });
    render(<Metadata />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('does not redirect when user is admin even if dataset is not published', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: { ...buildDataset(), status: 'STAGED' } }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    (useAuthContext as jest.Mock).mockReturnValue({ isLoading: false });
    render(<Metadata />);
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mobile layout
// ---------------------------------------------------------------------------

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

  it('does not show the mandatory-fields legend on mobile even when user is admin', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildAdminDataset() }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);
    expect(screen.queryByTestId('sh-mandatory-fields')).not.toBeInTheDocument();
  });

  it('does not show the Save button on mobile even when user is admin', () => {
    (useMetadata as jest.Mock).mockReturnValue(baseHookMock({ dataset: buildAdminDataset() }));
    (useEntitlements as jest.Mock).mockReturnValue({ can: () => true });
    render(<Metadata />);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
