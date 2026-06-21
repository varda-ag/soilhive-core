import { render, screen, fireEvent, act } from '@testing-library/react';
import { DatasetsPreviewStep } from '../../../src/pages/AdminPortal/DatasetsPreviewStep/DatasetsPreviewStep';
import { useDatasetPreview } from 'hooks/useDatasetPreviewStep';

jest.mock('react-router', () => ({
  useParams: () => ({ id: '123' }),
}));

jest.mock('hooks/useDatasetPreviewStep', () => ({
  useDatasetPreview: jest.fn(),
}));

jest.mock('primereact/dropdown', () => ({
  Dropdown: ({ onChange, value, options, disabled }: any) => (
    <select data-testid="file-dropdown" disabled={disabled} value={value ?? ''} onChange={e => onChange?.({ value: e.target.value })}>
      {(options ?? []).map((opt: any) => (
        <option key={opt.id} value={opt.id}>
          {opt.name}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('primereact/multiselect', () => ({
  MultiSelect: ({ onChange, value, options, disabled }: any) => (
    <div
      data-testid="column-multiselect"
      data-disabled={String(disabled)}
      data-value={JSON.stringify(value ?? [])}
    >
      {(options ?? []).map((opt: any) => (
        <button
          key={opt.value}
          data-testid={`col-option-${opt.value}`}
          onClick={() =>
            onChange?.({
              value: (value ?? []).includes(opt.value)
                ? (value ?? []).filter((v: string) => v !== opt.value)
                : [...(value ?? []), opt.value],
            })
          }
        >
          {opt.name}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('components/UI/Table/Table', () => ({
  Table: ({ columns, emptyMessage }: any) => (
    <div data-testid="mock-table">
      {emptyMessage && <span data-testid="table-empty-message">{emptyMessage}</span>}
      <div data-testid="table-columns">
        {(columns ?? []).map((col: any) => (
          <div key={col.value} data-testid={`table-col-${col.value}`}>
            {col.name}
          </div>
        ))}
      </div>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseHook = {
  datasetFileMappings: [] as any[],
  soilData: [] as any[],
  allSoilData: [] as any[],
  availableColumns: [] as string[],
  isLoading: false,
  onFileChange: jest.fn(),
  selectedFile: null,
  loadMore: jest.fn(),
  onSortChange: jest.fn(),
  sortField: undefined as string | undefined,
  sortOrder: null as 1 | -1 | null,
  computedPropertyNames: {} as Record<string, string>,
  unitsMapping: {} as Record<string, string | undefined>,
  currentFileDeletions: new Set<number>(),
  toggleDeletion: jest.fn(),
  showLoadingPanel: false,
  handlePrevious: jest.fn(),
  handleSaveAndContinueLater: jest.fn(),
  handleContinue: jest.fn(),
  navigateToDatasets: jest.fn(),
};

function mockHook(overrides: Partial<typeof baseHook> = {}) {
  (useDatasetPreview as jest.Mock).mockReturnValue({ ...baseHook, ...overrides });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => jest.fn()),
  useParams: jest.fn(() => ({})),
}));

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(() => ({
    isLoading: false,
    getFurthestStep: jest.fn(() => 'general-info'),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  })),
}));

describe('DatasetsPreviewStep', () => {
  beforeEach(() => {
    mockHook();
    jest.clearAllMocks();
    mockHook();
  });

  describe('rendering', () => {
    it('renders the title', () => {
      render(<DatasetsPreviewStep />);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('renders the description message', () => {
      render(<DatasetsPreviewStep />);
      expect(screen.getByText(/make sure everything is correct/i)).toBeInTheDocument();
    });

    it('renders the "Show original name" label', () => {
      render(<DatasetsPreviewStep />);
      expect(screen.getByText('Show original name')).toBeInTheDocument();
    });

    it('renders Previous, Save and continue later, and Continue buttons', () => {
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('sh-preview-previous')).toBeInTheDocument();
      expect(screen.getByTestId('sh-preview-save-later')).toBeInTheDocument();
      expect(screen.getByTestId('sh-preview-continue')).toBeInTheDocument();
    });

    it('renders the table', () => {
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('calls handlePrevious when Previous is clicked', () => {
      const handlePrevious = jest.fn();
      mockHook({ handlePrevious });
      render(<DatasetsPreviewStep />);
      fireEvent.click(screen.getByTestId('sh-preview-previous'));
      expect(handlePrevious).toHaveBeenCalledTimes(1);
    });

    it('calls handleSaveAndContinueLater when that button is clicked', () => {
      const handleSaveAndContinueLater = jest.fn();
      mockHook({ handleSaveAndContinueLater });
      render(<DatasetsPreviewStep />);
      fireEvent.click(screen.getByTestId('sh-preview-save-later'));
      expect(handleSaveAndContinueLater).toHaveBeenCalledTimes(1);
    });

    it('calls handleContinue when Continue is clicked', () => {
      const handleContinue = jest.fn();
      mockHook({ handleContinue });
      render(<DatasetsPreviewStep />);
      fireEvent.click(screen.getByTestId('sh-preview-continue'));
      expect(handleContinue).toHaveBeenCalledTimes(1);
    });
  });

  describe('visible columns initialisation', () => {
    it('auto-selects initialVisibleColumns + all extra property columns when availableColumns arrives', () => {
      mockHook({ availableColumns: ['min_depth', 'max_depth', 'ph'] });
      render(<DatasetsPreviewStep />);
      // ph is an extra property column and should appear in the table
      expect(screen.getByTestId('table-col-ph')).toBeInTheDocument();
      expect(screen.getByTestId('table-col-min_depth')).toBeInTheDocument();
      expect(screen.getByTestId('table-col-max_depth')).toBeInTheDocument();
    });

    it('auto-selects all extra property columns, not just the first', () => {
      mockHook({ availableColumns: ['min_depth', 'max_depth', 'ph', 'carbon', 'nitrogen'] });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('table-col-ph')).toBeInTheDocument();
      expect(screen.getByTestId('table-col-carbon')).toBeInTheDocument();
      expect(screen.getByTestId('table-col-nitrogen')).toBeInTheDocument();
    });

    it('does not auto-select license even when present in availableColumns', () => {
      mockHook({ availableColumns: ['min_depth', 'max_depth', 'ph', 'license'] });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('table-col-ph')).toBeInTheDocument();
      expect(screen.queryByTestId('table-col-license')).not.toBeInTheDocument();
    });

    it('uses only initialVisibleColumns when availableColumns has no extra columns', () => {
      mockHook({ availableColumns: ['min_depth', 'max_depth'] });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('table-col-min_depth')).toBeInTheDocument();
      expect(screen.getByTestId('table-col-max_depth')).toBeInTheDocument();
      // no extra columns
      expect(screen.queryByTestId('table-col-ph')).not.toBeInTheDocument();
    });

    it('always includes the delete column', () => {
      mockHook({ availableColumns: ['min_depth'] });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('table-col-delete')).toBeInTheDocument();
    });

    it('does not pass initialVisibleColumns absent from availableColumns as selected MultiSelect values', () => {
      // Regression test: CSV has no min_depth/max_depth/horizon columns so the API
      // only returns sampling_date + soil property columns. Previously visibleColumns
      // always included all initialVisibleColumns, causing PrimeReact to display "null"
      // for any selected value it could not resolve to an option label.
      mockHook({ availableColumns: ['sampling_date', 'ph', 'carbon'] });
      render(<DatasetsPreviewStep />);
      const selected: string[] = JSON.parse(
        screen.getByTestId('column-multiselect').getAttribute('data-value') ?? '[]',
      );
      expect(selected).not.toContain('min_depth');
      expect(selected).not.toContain('max_depth');
      expect(selected).not.toContain('horizon');
      expect(selected).toContain('sampling_date');
    });
  });

  describe('show original name toggle', () => {
    it('hides original column keys by default', () => {
      mockHook({ availableColumns: ['min_depth'] });
      render(<DatasetsPreviewStep />);
      const colHeader = screen.getByTestId('table-col-min_depth');
      expect(colHeader).not.toHaveTextContent('min_depth');
    });

    it('shows original column keys after toggling on', () => {
      mockHook({ availableColumns: ['min_depth'] });
      render(<DatasetsPreviewStep />);
      const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      act(() => {
        fireEvent.click(toggle);
      });
      const colHeader = screen.getByTestId('table-col-min_depth');
      expect(colHeader).toHaveTextContent('min_depth');
    });
  });

  describe('empty message', () => {
    it('shows "Loading..." when isLoading and allSoilData is empty', () => {
      mockHook({ isLoading: true, allSoilData: [], soilData: [] });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('table-empty-message')).toHaveTextContent('Loading...');
    });

    it('shows "Loading..." when soilData is non-empty but allSoilData is still empty', () => {
      const soilData = [{ record_id: 1, cursor: 'c1' }] as any;
      mockHook({ isLoading: false, allSoilData: [], soilData });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('table-empty-message')).toHaveTextContent('Loading...');
    });

    it('shows no empty message when data is loaded', () => {
      const row = { record_id: 1, cursor: 'c1' } as any;
      mockHook({ isLoading: false, allSoilData: [row], soilData: [row] });
      render(<DatasetsPreviewStep />);
      expect(screen.queryByTestId('table-empty-message')).not.toBeInTheDocument();
    });
  });

  describe('file dropdown', () => {
    it('renders a file option per datasetFileMapping', () => {
      mockHook({
        datasetFileMappings: [
          { fileID: 'file-a', mappingId: 1, id: 1 },
          { fileID: 'file-b', mappingId: 2, id: 2 },
        ] as any,
      });
      render(<DatasetsPreviewStep />);
      expect(screen.getByRole('option', { name: 'file-a' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'file-b' })).toBeInTheDocument();
    });

    it('calls onFileChange when the dropdown selection changes', () => {
      const onFileChange = jest.fn();
      mockHook({
        onFileChange,
        datasetFileMappings: [{ fileID: 'file-a', mappingId: 1, id: 1 }] as any,
      });
      render(<DatasetsPreviewStep />);
      fireEvent.change(screen.getByTestId('file-dropdown'), { target: { value: 'file-a' } });
      expect(onFileChange).toHaveBeenCalledWith('file-a');
    });

    it('disables the dropdown while loading', () => {
      mockHook({ isLoading: true });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('file-dropdown')).toBeDisabled();
    });
  });

  describe('column multiselect', () => {
    it('disables the multiselect while loading', () => {
      mockHook({ isLoading: true });
      render(<DatasetsPreviewStep />);
      expect(screen.getByTestId('column-multiselect')).toHaveAttribute('data-disabled', 'true');
    });

    it('clicking a column option toggles it in the visible columns', () => {
      mockHook({ availableColumns: ['min_depth', 'max_depth', 'ph'] });
      render(<DatasetsPreviewStep />);
      // ph is already visible (auto-selected as an extra property column)
      expect(screen.getByTestId('table-col-ph')).toBeInTheDocument();

      // deselect ph
      act(() => {
        fireEvent.click(screen.getByTestId('col-option-ph'));
      });
      expect(screen.queryByTestId('table-col-ph')).not.toBeInTheDocument();
    });
  });

  describe('data loading panel', () => {
    it('does not show the panel by default', () => {
      render(<DatasetsPreviewStep />);
      expect(screen.queryByText('Data loading started')).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-table')).toBeInTheDocument();
    });

    it('shows the panel and hides the table and action buttons when showLoadingPanel is true', () => {
      mockHook({ showLoadingPanel: true });
      render(<DatasetsPreviewStep />);
      expect(screen.getByText('Data loading started')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-table')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-preview-previous')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-preview-continue')).not.toBeInTheDocument();
    });

    it('calls navigateToDatasets when the panel Continue button is clicked', () => {
      const navigateToDatasets = jest.fn();
      mockHook({ showLoadingPanel: true, navigateToDatasets });
      render(<DatasetsPreviewStep />);
      fireEvent.click(screen.getByText('Continue'));
      expect(navigateToDatasets).toHaveBeenCalledTimes(1);
    });
  });

  it('matches snapshot', () => {
    mockHook({ availableColumns: ['min_depth', 'max_depth', 'ph'] });
    const { container } = render(<DatasetsPreviewStep />);
    expect(container).toMatchSnapshot();
  });
});
