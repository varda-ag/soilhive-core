import { render, screen, fireEvent } from '@testing-library/react';
import { MapBasedFiltersTable } from 'components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTable';
import type { RasterFilterCategory } from 'types/backend';

let capturedColumns: any[] = [];
let capturedTableProps: any = {};

jest.mock('utilities/date', () => ({
  dateStringToDDMMYYYY: (date: Date | null) => (date ? '15-01-2024' : '—'),
}));

jest.mock('components/Table/Table', () => ({
  Table: ({ value, columns, emptyMessage, defaultSortField, defaultSortOrder, dataKey }: any) => {
    capturedColumns = columns;
    capturedTableProps = { defaultSortField, defaultSortOrder, dataKey };

    return (
      <div data-testid="mock-table">
        {columns.map((col: any) => (
          <div key={col.value} data-testid={`col-${col.value}`}>
            {col.name}
          </div>
        ))}
        {value.map((row: any) => (
          <div key={row.id} data-testid={`row-${row.id}`}>
            {columns.map((col: any) => (
              <div key={col.value} data-testid={`${col.value}-cell-${row.id}`}>
                {col.bodyTemplate?.(row)}
              </div>
            ))}
          </div>
        ))}
        {value.length === 0 && <div data-testid="empty-message">{emptyMessage}</div>}
      </div>
    );
  },
}));

jest.mock('components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTableStatusTemplate/MapBasedFiltersTableStatusTemplate', () => ({
  MapBasedFiltersTableStatusTemplate: ({ filter, isLoading, onSetCategoryActive }: any) => (
    <button
      data-testid={`status-${filter.id}`}
      data-is-loading={String(isLoading)}
      onClick={() => onSetCategoryActive(filter.id, !filter.active)}
    />
  ),
}));

jest.mock('components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTableActionTemplate/MapBasedFiltersTableActionTemplate', () => ({
  MapBasedFiltersTableActionTemplate: ({ filter, onEdit, onDelete }: any) => (
    <>
      <button data-testid={`edit-${filter.id}`} onClick={() => onEdit(filter.id)} />
      <button data-testid={`delete-${filter.id}`} onClick={() => onDelete(filter)} />
    </>
  ),
}));

const makeFilter = (overrides?: Partial<RasterFilterCategory>): RasterFilterCategory => ({
  id: 'land_cover',
  name: 'Land Cover',
  description: '',
  enabled: true,
  active: false,
  mappings: null,
  created_at: '2024-01-15T00:00:00Z',
  created_by: null,
  updated_at: '2024-01-15T00:00:00Z',
  deleted_at: null,
  ...overrides,
});

const filters = [
  makeFilter({ id: 'land_cover', name: 'Land Cover', created_by: 'alice@example.com' }),
  makeFilter({ id: 'soil_type', name: 'Soil Type', active: true }),
  makeFilter({ id: 'climate', name: 'Climate', enabled: false }),
];

const defaultProps = {
  filters,
  isLoading: false,
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onSetCategoryActive: jest.fn(),
};

const sortByStatus = (data: RasterFilterCategory[], order: number | undefined) =>
  capturedColumns.find((col: any) => col.value === 'enabled').sortFunction({ data, order });

describe('MapBasedFiltersTable', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders the four columns with translated headers', () => {
    render(<MapBasedFiltersTable {...defaultProps} />);

    expect(screen.getByTestId('col-name')).toHaveTextContent('Name');
    expect(screen.getByTestId('col-enabled')).toHaveTextContent('Status');
    expect(screen.getByTestId('col-created_at')).toHaveTextContent('Creation date');
    expect(screen.getByTestId('col-actions')).toHaveTextContent('Actions');
  });

  it('makes every column but actions sortable', () => {
    render(<MapBasedFiltersTable {...defaultProps} />);

    expect(capturedColumns.map((col: any) => [col.value, col.sortable])).toEqual([
      ['name', true],
      ['enabled', true],
      ['created_at', true],
      ['actions', false],
    ]);
  });

  it('renders a row for each filter', () => {
    render(<MapBasedFiltersTable {...defaultProps} />);

    expect(screen.getByTestId('row-land_cover')).toBeInTheDocument();
    expect(screen.getByTestId('row-soil_type')).toBeInTheDocument();
    expect(screen.getByTestId('row-climate')).toBeInTheDocument();
  });

  it('renders the empty message when there are no filters', () => {
    render(<MapBasedFiltersTable {...defaultProps} filters={[]} />);

    expect(screen.getByTestId('empty-message')).toHaveTextContent('No filters added');
  });

  it('sorts by creation date, newest first, and keys rows by id', () => {
    render(<MapBasedFiltersTable {...defaultProps} />);

    expect(capturedTableProps).toEqual({ defaultSortField: 'created_at', defaultSortOrder: -1, dataKey: 'id' });
  });

  describe('name column', () => {
    it('renders the filter name', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      expect(screen.getByTestId('name-cell-land_cover')).toHaveTextContent('Land Cover');
    });
  });

  describe('status column', () => {
    it('passes isLoading to the status template', () => {
      render(<MapBasedFiltersTable {...defaultProps} isLoading />);

      expect(screen.getByTestId('status-land_cover')).toHaveAttribute('data-is-loading', 'true');
    });

    it('passes onSetCategoryActive to the status template', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      fireEvent.click(screen.getByTestId('status-land_cover'));

      expect(defaultProps.onSetCategoryActive).toHaveBeenCalledWith('land_cover', true);
    });
  });

  describe('created_at column', () => {
    it('renders the formatted date', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      expect(screen.getByTestId('created_at-cell-land_cover')).toHaveTextContent('15-01-2024');
    });

    it('renders created_by when present', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      expect(screen.getByTestId('created_at-cell-land_cover')).toHaveTextContent('alice@example.com');
    });

    it('renders — when created_by is null', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      expect(screen.getByTestId('created_at-cell-soil_type')).toHaveTextContent('—');
    });
  });

  describe('actions column', () => {
    it('passes onEdit to the action template', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      fireEvent.click(screen.getByTestId('edit-soil_type'));

      expect(defaultProps.onEdit).toHaveBeenCalledWith('soil_type');
    });

    it('passes onDelete to the action template', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      fireEvent.click(screen.getByTestId('delete-soil_type'));

      expect(defaultProps.onDelete).toHaveBeenCalledWith(filters[1]);
    });
  });

  describe('status sort function', () => {
    const notInstalled = makeFilter({ id: 'not_installed', enabled: false });
    const inactive = makeFilter({ id: 'inactive', enabled: true, active: false });
    const active = makeFilter({ id: 'active', enabled: true, active: true });

    it('sorts ascending: not installed, inactive, active', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      const sorted = sortByStatus([active, notInstalled, inactive], 1);

      expect(sorted.map((filter: RasterFilterCategory) => filter.id)).toEqual(['not_installed', 'inactive', 'active']);
    });

    it('sorts descending: active, inactive, not installed', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      const sorted = sortByStatus([inactive, notInstalled, active], -1);

      expect(sorted.map((filter: RasterFilterCategory) => filter.id)).toEqual(['active', 'inactive', 'not_installed']);
    });

    it('does not mutate the given data', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      const data = [active, notInstalled, inactive];
      sortByStatus(data, 1);

      expect(data).toEqual([active, notInstalled, inactive]);
    });

    it('keeps the order when there is no sort order', () => {
      render(<MapBasedFiltersTable {...defaultProps} />);

      const sorted = sortByStatus([active, notInstalled, inactive], undefined);

      expect(sorted.map((filter: RasterFilterCategory) => filter.id)).toEqual(['active', 'not_installed', 'inactive']);
    });
  });
});
