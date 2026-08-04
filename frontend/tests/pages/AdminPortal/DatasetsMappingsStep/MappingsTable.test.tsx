import { render, screen, fireEvent } from '@testing-library/react';
import { MappingsTable } from 'pages/AdminPortal/DatasetsMappingsStep/MappingsTable';

// MappingsTable is generic over row rendering — it only owns the header/wrapper shell and the
// columnMappings → renderRow loop. Row-level rendering/interaction is covered by MappingRow.test.tsx.

function defaultProps(overrides?: Partial<React.ComponentProps<typeof MappingsTable>>) {
  return {
    columnMappings: [{ columnName: 'col1' }],
    headerCells: ['Detected columns', 'Map to', 'Original Unit'],
    dataTestId: 'sh-mappings-table',
    renderRow: (columnName: string) => <div key={columnName} data-testid="sh-mapping-row" data-column-name={columnName} />,
    ...overrides,
  };
}

describe('MappingsTable', () => {
  it('renders with the given data-testid', () => {
    render(<MappingsTable {...defaultProps()} />);
    expect(screen.getByTestId('sh-mappings-table')).toBeInTheDocument();
  });

  it('renders the header labels', () => {
    render(<MappingsTable {...defaultProps({ headerCells: ['Detected columns', 'Map to', 'Original Unit'] })} />);
    expect(screen.getByText('Detected columns')).toBeInTheDocument();
    expect(screen.getByText('Map to')).toBeInTheDocument();
    expect(screen.getByText('Original Unit')).toBeInTheDocument();
  });

  it('renders an additional header cell for variants with a 4th column (e.g. raster depth)', () => {
    render(<MappingsTable {...defaultProps({ headerCells: ['Detected layers', 'Map to', 'Original Unit', 'Min-max depth (cm)'] })} />);
    expect(screen.getByText('Min-max depth (cm)')).toBeInTheDocument();
  });

  it('renders no rows when columnMappings is empty', () => {
    render(<MappingsTable {...defaultProps({ columnMappings: [] })} />);
    expect(screen.queryAllByTestId('sh-mapping-row')).toHaveLength(0);
  });

  it('renders one row per column mapping, in order, by calling renderRow with the column name', () => {
    render(<MappingsTable {...defaultProps({ columnMappings: [{ columnName: 'col1' }, { columnName: 'col2' }] })} />);
    const rows = screen.getAllByTestId('sh-mapping-row');
    expect(rows.map(r => r.getAttribute('data-column-name'))).toEqual(['col1', 'col2']);
  });

  it('lets renderRow wire up interactions (e.g. a toggle) for each row', () => {
    const onToggleRow = jest.fn();
    render(
      <MappingsTable
        {...defaultProps({
          columnMappings: [{ columnName: 'col1' }],
          renderRow: columnName => <div key={columnName} data-testid="sh-mapping-row" onClick={() => onToggleRow(columnName)} />,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('sh-mapping-row'));
    expect(onToggleRow).toHaveBeenCalledWith('col1');
  });
});
