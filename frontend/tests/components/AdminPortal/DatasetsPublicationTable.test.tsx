import { render, screen } from '@testing-library/react';
import { DatasetsPublicationTable } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsPublicationTable';

let capturedColumns: any[] = [];
let capturedTableProps: any = {};

jest.mock('utilities/date', () => ({
  dateStringToDDMMYYYY: (date: Date | null) => (date ? '15/01/2024' : ''),
}));

jest.mock('components/UI/Table/Table', () => ({
  Table: ({ value, columns, emptyMessage, rowClassName, defaultSortField, defaultSortOrder }: any) => {
    capturedColumns = columns;
    capturedTableProps = { defaultSortField, defaultSortOrder };

    return (
      <div data-testid="mock-table">
        {columns.map((col: any) => (
          <div key={col.value} data-testid={`col-${col.value}`}>
            {col.name}
          </div>
        ))}
        {value.map((row: any) => {
          const nameCol = columns.find((c: any) => c.value === 'name');
          const updatedAtCol = columns.find((c: any) => c.value === 'updated_at');
          const actionsCol = columns.find((c: any) => c.value === 'actions');
          return (
            <div key={row.id} data-testid={`row-${row.id}`} className={rowClassName?.(row)}>
              <div data-testid={`name-cell-${row.id}`}>{nameCol?.bodyTemplate?.(row)}</div>
              <div data-testid={`updated-at-cell-${row.id}`}>{updatedAtCol?.bodyTemplate?.(row)}</div>
              {actionsCol?.bodyTemplate?.(row)}
            </div>
          );
        })}
        {value.length === 0 && <div data-testid="empty-message">{emptyMessage}</div>}
      </div>
    );
  },
}));

jest.mock('components/AdminPortal/DatasetsPublicationTable/DatasetsTableActionTemplate/DatasetsTableActionTemplate', () => ({
  DatasetsTableActionTemplate: ({ dataset }: any) => <div data-testid={`action-${dataset.id}`} />,
}));

jest.mock('components/AdminPortal/DatasetsPublicationTable/DatasetsTableStatusTemplate/DatasetsTableStatusTemplate', () => ({
  DatasetsTableStatusTemplate: ({ dataset }: any) => <span data-testid="status-template">{dataset.status}</span>,
}));

jest.mock('components/AdminPortal/DatasetsPublicationTable/DatasetsTableVisibilityTemplate/DatasetsTableVisibilityTemplate', () => ({
  DatasetsTableVisibilityTemplate: ({ visibility }: any) => <span data-testid="visibility-template">{visibility}</span>,
}));

const datasets = [
  {
    id: '1',
    name: 'Alpha',
    status: 'PENDING',
    visibility: 'public',
    hasErrors: false,
    gis_datatype: 'point',
    updated_at: new Date('2024-01-15'),
    updated_by: 'alice@example.com',
  },
  {
    id: '2',
    name: 'Beta',
    status: 'LOADED',
    visibility: 'private',
    hasErrors: false,
    gis_datatype: null,
    updated_at: new Date('2024-02-20'),
    updated_by: null,
  },
  {
    id: '3',
    name: 'Gamma',
    status: 'PENDING',
    visibility: 'public',
    hasErrors: true,
    gis_datatype: 'polygonal',
    updated_at: null,
    updated_by: undefined,
  },
];

const defaultProps = {
  datasets: datasets as any,
  isSearch: false,
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onPublish: jest.fn(),
  onShowErrors: jest.fn(),
};

describe('DatasetsPublicationTable', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Table component', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('mock-table')).toBeInTheDocument();
  });

  it('renders all 5 columns', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('col-name')).toBeInTheDocument();
    expect(screen.getByTestId('col-status')).toBeInTheDocument();
    expect(screen.getByTestId('col-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('col-updated_at')).toBeInTheDocument();
    expect(screen.getByTestId('col-actions')).toBeInTheDocument();
  });

  it('renders empty message when datasets is empty and isSearch is false', () => {
    render(<DatasetsPublicationTable {...defaultProps} datasets={[]} isSearch={false} />);

    expect(screen.getByTestId('empty-message')).toHaveTextContent('No datasets yet. Click "Add dataset" to create one');
  });

  it('renders search empty message when datasets is empty and isSearch is true', () => {
    render(<DatasetsPublicationTable {...defaultProps} datasets={[]} isSearch={true} />);

    expect(screen.getByTestId('empty-message')).toHaveTextContent('No datasets matching your search query');
  });

  it('rowClassName returns highlighted class for LOADED status without errors', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('row-2')).toHaveClass('sh-row-highlighted');
  });

  it('rowClassName returns error class for rows with hasErrors', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('row-3')).toHaveClass('sh-row-error');
  });

  it('rowClassName returns undefined for non-LOADED status without errors', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('row-1')).not.toHaveClass('sh-row-highlighted');
    expect(screen.getByTestId('row-1')).not.toHaveClass('sh-row-error');
  });

  it('renders DatasetsTableActionTemplate for each row via actionsBodyTemplate', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('action-1')).toBeInTheDocument();
    expect(screen.getByTestId('action-2')).toBeInTheDocument();
  });

  it('passes defaultSortField "updated_at" and defaultSortOrder -1 to Table', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(capturedTableProps.defaultSortField).toBe('updated_at');
    expect(capturedTableProps.defaultSortOrder).toBe(-1);
  });

  describe('name column', () => {
    it('renders the dataset name', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('name-cell-1')).toHaveTextContent('Alpha');
    });

    it('renders gis_datatype when present', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('name-cell-1')).toHaveTextContent('point');
      expect(screen.getByTestId('name-cell-3')).toHaveTextContent('polygonal');
    });

    it('does not render gis_datatype when null', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('name-cell-2')).toHaveTextContent('Beta');
      expect(screen.getByTestId('name-cell-2')).not.toHaveTextContent('null');
    });
  });

  describe('updated_at column', () => {
    it('renders the formatted date', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('updated-at-cell-1')).toHaveTextContent('15/01/2024');
    });

    it('renders updated_by when present', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('updated-at-cell-1')).toHaveTextContent('alice@example.com');
    });

    it('renders — when updated_by is null', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('updated-at-cell-2')).toHaveTextContent('—');
    });

    it('renders — when updated_by is undefined', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      expect(screen.getByTestId('updated-at-cell-3')).toHaveTextContent('—');
    });
  });

  describe('status sort function', () => {
    it('sorts ascending by status order', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      const statusCol = capturedColumns.find((c: any) => c.value === 'status');
      const data = [
        { id: '1', name: 'A', status: 'PUBLISHED' },
        { id: '2', name: 'B', status: 'PENDING' },
        { id: '3', name: 'C', status: 'LOADED' },
        { id: '4', name: 'D', status: 'ONGOING' },
      ];

      const sorted = statusCol.sortFunction({ data, order: 1 });
      expect(sorted.map((r: any) => r.status)).toEqual(['PENDING', 'ONGOING', 'LOADED', 'PUBLISHED']);
    });

    it('sorts descending by status order', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      const statusCol = capturedColumns.find((c: any) => c.value === 'status');
      const data = [
        { id: '1', name: 'A', status: 'PENDING' },
        { id: '2', name: 'B', status: 'PUBLISHED' },
      ];

      const sorted = statusCol.sortFunction({ data, order: -1 });
      expect(sorted.map((r: any) => r.status)).toEqual(['PUBLISHED', 'PENDING']);
    });

    it('falls back to 0 for unknown status (covers ?? 0 branch)', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      const statusCol = capturedColumns.find((c: any) => c.value === 'status');
      const data = [
        { id: '1', name: 'A', status: 'UNKNOWN_STATUS' },
        { id: '2', name: 'B', status: 'PENDING' },
        { id: '3', name: 'C', status: 'UNKNOWN_STATUS' },
      ];

      const sorted = statusCol.sortFunction({ data, order: 1 });
      expect(sorted).toHaveLength(3);
    });

    it('handles undefined order (covers || 0 branch)', () => {
      render(<DatasetsPublicationTable {...defaultProps} />);

      const statusCol = capturedColumns.find((c: any) => c.value === 'status');
      const data = [
        { id: '1', name: 'A', status: 'PENDING' },
        { id: '2', name: 'B', status: 'PUBLISHED' },
      ];

      const sorted = statusCol.sortFunction({ data, order: undefined });
      expect(sorted).toHaveLength(2);
    });
  });
});
