import { render, screen } from '@testing-library/react';
import { DatasetsPublicationTable } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsPublicationTable';

let capturedColumns: any[] = [];
let capturedTableProps: any = {};

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
          const actionsCol = columns.find((c: any) => c.value === 'actions');
          return (
            <div key={row.id} data-testid={`row-${row.id}`} className={rowClassName?.(row)}>
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
  DatasetsTableStatusTemplate: ({ status }: any) => <span data-testid="status-template">{status}</span>,
}));

jest.mock('components/AdminPortal/DatasetsPublicationTable/DatasetsTableVisibilityTemplate/DatasetsTableVisibilityTemplate', () => ({
  DatasetsTableVisibilityTemplate: ({ visibility }: any) => <span data-testid="visibility-template">{visibility}</span>,
}));

const datasets = [
  { id: '1', name: 'Alpha', status: 'PENDING', visibility: 'public' },
  { id: '2', name: 'Beta', status: 'LOADED', visibility: 'private' },
];

const defaultProps = {
  datasets: datasets as any,
  isSearch: false,
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onPublish: jest.fn(),
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

  it('rowClassName returns highlighted class for LOADED status', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('row-2')).toHaveClass('TableRowHighlighted');
  });

  it('rowClassName returns undefined for non-LOADED status', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('row-1')).not.toHaveClass('TableRowHighlighted');
  });

  it('renders DatasetsTableActionTemplate for each row via actionsBodyTemplate', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(screen.getByTestId('action-1')).toBeInTheDocument();
    expect(screen.getByTestId('action-2')).toBeInTheDocument();
  });

  it('passes defaultSortField "name" and defaultSortOrder 1 to Table', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    expect(capturedTableProps.defaultSortField).toBe('name');
    expect(capturedTableProps.defaultSortOrder).toBe(1);
  });

  it('statusSortFunction sorts ascending by status order', () => {
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

  it('statusSortFunction sorts descending by status order', () => {
    render(<DatasetsPublicationTable {...defaultProps} />);

    const statusCol = capturedColumns.find((c: any) => c.value === 'status');
    const data = [
      { id: '1', name: 'A', status: 'PENDING' },
      { id: '2', name: 'B', status: 'PUBLISHED' },
    ];

    const sorted = statusCol.sortFunction({ data, order: -1 });
    expect(sorted.map((r: any) => r.status)).toEqual(['PUBLISHED', 'PENDING']);
  });

  it('statusSortFunction falls back to 0 for unknown status (covers ?? 0 branch)', () => {
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

  it('statusSortFunction handles undefined order (covers || 0 branch)', () => {
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
