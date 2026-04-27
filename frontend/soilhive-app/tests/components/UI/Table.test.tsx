import { render, screen } from '@testing-library/react';
import { Table } from 'components/UI/Table/Table';
import type { TableColumn } from 'types/components';

type Row = { id: string; name: string; status: string };

jest.mock('primereact/datatable', () => ({
  DataTable: ({ value, children, className, emptyMessage, sortIcon, sortField, sortOrder }: any) => (
    <div data-testid="mock-datatable" className={className} data-sort-field={sortField} data-sort-order={sortOrder}>
      <div data-testid="mock-columns">{children}</div>
      {value.length === 0 && emptyMessage && <div data-testid="mock-empty">{emptyMessage}</div>}
      <div data-testid="mock-sort-unsorted">{sortIcon?.({ sorted: false, sortOrder: 0, iconProps: { className: '' } })}</div>
      <div data-testid="mock-sort-asc">{sortIcon?.({ sorted: true, sortOrder: 1, iconProps: { className: '' } })}</div>
      <div data-testid="mock-sort-desc">{sortIcon?.({ sorted: true, sortOrder: -1, iconProps: { className: '' } })}</div>
    </div>
  ),
}));

jest.mock('primereact/column', () => ({
  Column: ({ header, field }: any) => (
    <div data-testid={`mock-column-${field}`}>
      <span data-testid={`header-${field}`}>{header}</span>
    </div>
  ),
}));

const columns: TableColumn<Row>[] = [
  { name: 'Name', value: 'name' },
  { name: 'Status', value: 'status', sortable: true },
];

const rows: Row[] = [
  { id: '1', name: 'Alpha', status: 'active' },
  { id: '2', name: 'Beta', status: 'inactive' },
];

describe('Table component', () => {
  it('renders a column for each entry in columns', () => {
    render(<Table value={rows} columns={columns} />);

    expect(screen.getByTestId('mock-column-name')).toBeInTheDocument();
    expect(screen.getByTestId('mock-column-status')).toBeInTheDocument();
  });

  it('renders correct header labels', () => {
    render(<Table value={rows} columns={columns} />);

    expect(screen.getByTestId('header-name')).toHaveTextContent('Name');
    expect(screen.getByTestId('header-status')).toHaveTextContent('Status');
  });

  it('renders emptyMessage when value is empty', () => {
    render(<Table value={[]} columns={columns} emptyMessage="No data available" />);

    expect(screen.getByTestId('mock-empty')).toHaveTextContent('No data available');
  });

  it('does not render emptyMessage when value has rows', () => {
    render(<Table value={rows} columns={columns} emptyMessage="No data" />);

    expect(screen.queryByTestId('mock-empty')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Table value={rows} columns={columns} className="my-table" />);

    expect(screen.getByTestId('mock-datatable')).toHaveClass('my-table');
  });

  it('renders unsorted sort icon with SortNone class', () => {
    render(<Table value={rows} columns={columns} />);

    const icon = screen.getByTestId('mock-sort-unsorted').querySelector('svg');
    expect(icon).toHaveClass('SortNone');
  });

  it('renders ascending sort icon with SortDown class', () => {
    render(<Table value={rows} columns={columns} />);

    const icon = screen.getByTestId('mock-sort-asc').querySelector('svg');
    expect(icon).toHaveClass('SortDown');
  });

  it('renders descending sort icon with SortUp class', () => {
    render(<Table value={rows} columns={columns} />);

    const icon = screen.getByTestId('mock-sort-desc').querySelector('svg');
    expect(icon).toHaveClass('SortUp');
  });

  it('passes defaultSortField to DataTable', () => {
    render(<Table value={rows} columns={columns} defaultSortField="name" />);
    expect(screen.getByTestId('mock-datatable')).toHaveAttribute('data-sort-field', 'name');
  });

  it('passes defaultSortOrder to DataTable', () => {
    render(<Table value={rows} columns={columns} defaultSortOrder={1} />);
    expect(screen.getByTestId('mock-datatable')).toHaveAttribute('data-sort-order', '1');
  });

  it('matches snapshot', () => {
    const { container } = render(<Table value={rows} columns={columns} />);
    expect(container).toMatchSnapshot();
  });
});
