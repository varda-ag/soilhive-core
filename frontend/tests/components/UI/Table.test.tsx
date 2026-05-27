import { render, screen, act } from '@testing-library/react';
import { useRef } from 'react';
import { Table } from 'components/UI/Table/Table';
import type { TableColumn } from 'types/components';
import type { TableHandle } from 'components/UI/Table/Table';

type Row = { id: string; name: string; status: string };

const mockResetColumnOrder = jest.fn();
const mockGetElement = jest.fn();

jest.mock('primereact/datatable', () => ({
  DataTable: ({
    ref,
    value,
    children,
    className,
    emptyMessage,
    sortIcon,
    sortField,
    sortOrder,
    reorderableColumns,
    scrollable,
    onSort,
    onPage,
  }: any) => {
    if (ref) ref.current = { resetColumnOrder: mockResetColumnOrder, getElement: mockGetElement };
    return (
      <div
        data-testid="mock-datatable"
        className={className}
        data-sort-field={sortField}
        data-sort-order={sortOrder}
        data-reorderable-columns={String(reorderableColumns)}
        data-scrollable={String(scrollable)}
      >
        <div data-testid="mock-columns">{children}</div>
        {value.length === 0 && emptyMessage && <div data-testid="mock-empty">{emptyMessage}</div>}
        <div data-testid="mock-sort-unsorted">{sortIcon?.({ sorted: false, sortOrder: 0, iconProps: { className: '' } })}</div>
        <div data-testid="mock-sort-asc">{sortIcon?.({ sorted: true, sortOrder: 1, iconProps: { className: '' } })}</div>
        <div data-testid="mock-sort-desc">{sortIcon?.({ sorted: true, sortOrder: -1, iconProps: { className: '' } })}</div>
        <button data-testid="trigger-sort" onClick={() => onSort?.({ sortField: 'name', sortOrder: 1 })} />
        <button data-testid="trigger-page" onClick={() => onPage?.({ page: 2 })} />
      </div>
    );
  },
}));

jest.mock('primereact/column', () => ({
  Column: ({ header, field, sortable, reorderable, headerTooltip, className, body }: any) => (
    <div
      data-testid={`mock-column-${field}`}
      data-sortable={String(sortable)}
      data-reorderable={String(reorderable)}
      data-header-tooltip={headerTooltip}
      className={className}
    >
      <span data-testid={`header-${field}`}>{header}</span>
      {body && <div data-testid={`body-${field}`}>{body({ id: '1', name: 'Alpha', status: 'active' })}</div>}
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
  beforeEach(() => {
    mockResetColumnOrder.mockClear();
    mockGetElement.mockClear();
  });

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

  it('passes reorderableColumns to DataTable', () => {
    render(<Table value={rows} columns={columns} reorderableColumns={true} />);
    expect(screen.getByTestId('mock-datatable')).toHaveAttribute('data-reorderable-columns', 'true');
  });

  it('passes scrollable=true to DataTable by default', () => {
    render(<Table value={rows} columns={columns} />);
    expect(screen.getByTestId('mock-datatable')).toHaveAttribute('data-scrollable', 'true');
  });

  it('passes sortable prop to Column', () => {
    render(<Table value={rows} columns={columns} />);
    expect(screen.getByTestId('mock-column-status')).toHaveAttribute('data-sortable', 'true');
    expect(screen.getByTestId('mock-column-name')).not.toHaveAttribute('data-sortable', 'true');
  });

  it('passes columnClassName to Column', () => {
    render(<Table value={rows} columns={columns} columnClassName="col-class" />);
    expect(screen.getByTestId('mock-column-name')).toHaveClass('col-class');
    expect(screen.getByTestId('mock-column-status')).toHaveClass('col-class');
  });

  it('renders bodyTemplate output for a column', () => {
    const columnsWithBody: TableColumn<Row>[] = [
      { name: 'Name', value: 'name', bodyTemplate: row => <span>{row.name.toUpperCase()}</span> },
    ];
    render(<Table value={rows} columns={columnsWithBody} />);
    expect(screen.getByTestId('body-name')).toHaveTextContent('ALPHA');
  });

  it('passes headerTooltip to Column', () => {
    const columnsWithTooltip: TableColumn<Row>[] = [{ name: 'Name', value: 'name', headerTooltip: 'Full name of the record' }];
    render(<Table value={rows} columns={columnsWithTooltip} />);
    expect(screen.getByTestId('mock-column-name')).toHaveAttribute('data-header-tooltip', 'Full name of the record');
  });

  it('calls onSort when sort is triggered', () => {
    const onSort = jest.fn();
    render(<Table value={rows} columns={columns} onSort={onSort} />);
    screen.getByTestId('trigger-sort').click();
    expect(onSort).toHaveBeenCalledWith('name', 1);
  });

  it('does not throw when onSort is not provided and sort is triggered', () => {
    expect(() => {
      render(<Table value={rows} columns={columns} />);
      screen.getByTestId('trigger-sort').click();
    }).not.toThrow();
  });

  it('calls onPage when page is triggered', () => {
    const onPage = jest.fn();
    render(<Table value={rows} columns={columns} onPage={onPage} />);
    screen.getByTestId('trigger-page').click();
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('exposes resetColumnOrder via tableRef', () => {
    function Wrapper() {
      const ref = useRef<TableHandle>(null);
      return (
        <>
          <Table value={rows} columns={columns} tableRef={ref} />
          <button data-testid="call-reset" onClick={() => ref.current?.resetColumnOrder()} />
        </>
      );
    }
    render(<Wrapper />);
    act(() => {
      screen.getByTestId('call-reset').click();
    });
    expect(mockResetColumnOrder).toHaveBeenCalledTimes(1);
  });

  it('exposes getElement via tableRef', () => {
    mockGetElement.mockReturnValue(document.createElement('div'));
    function Wrapper() {
      const ref = useRef<TableHandle>(null);
      return (
        <>
          <Table value={rows} columns={columns} tableRef={ref} />
          <button data-testid="call-get-element" onClick={() => ref.current?.getElement()} />
        </>
      );
    }
    render(<Wrapper />);
    act(() => {
      screen.getByTestId('call-get-element').click();
    });
    expect(mockGetElement).toHaveBeenCalledTimes(1);
  });

  it('calls onScrollNearBottom when last row intersects', () => {
    const observeMock = jest.fn();
    const disconnectMock = jest.fn();
    let intersectCallback: (entries: any[]) => void;

    global.IntersectionObserver = jest.fn(cb => {
      intersectCallback = cb as (entries: any[]) => void;
      return { observe: observeMock, disconnect: disconnectMock };
    }) as any;

    const lastRow = document.createElement('tr');
    const tbody = document.createElement('tbody');
    tbody.className = 'p-datatable-tbody';
    tbody.appendChild(lastRow);
    const fakeEl = document.createElement('div');
    fakeEl.appendChild(tbody);
    mockGetElement.mockReturnValue(fakeEl);

    const onScrollNearBottom = jest.fn();
    render(<Table value={rows} columns={columns} onScrollNearBottom={onScrollNearBottom} />);

    act(() => intersectCallback([{ isIntersecting: true }]));
    expect(onScrollNearBottom).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot', () => {
    const { container } = render(<Table value={rows} columns={columns} />);
    expect(container).toMatchSnapshot();
  });
});
