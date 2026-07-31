import { render, screen, fireEvent } from '@testing-library/react';
import { RasterMappingsTable } from 'pages/AdminPortal/DatasetsMappingsStep/RasterMappingsTable';
import type { ColumnMapping, DetailOptionMap } from 'hooks/useRasterMappingStep';

// useRasterMappingStep pulls in a heavy transitive chain (useConfig → App → i18n setup) just by
// being imported — RasterMappingsTable only needs the METADATA_FIELD_CODES constant from it, so
// stub the module with that constant instead of loading the real hook.
jest.mock('hooks/useRasterMappingStep', () => ({
  METADATA_FIELD_CODES: new Set(['min_depth', 'max_depth']),
}));

// Isolate RasterMappingsTable's own logic (header, row wiring, isUnitEnabled/isDetailsEnabled
// derivation) from RasterMappingRow's rendering/interaction details, which are covered by
// RasterMappingRow.test.tsx.
jest.mock('pages/AdminPortal/DatasetsMappingsStep/RasterMappingRow', () => ({
  RasterMappingRow: (props: {
    mapping: ColumnMapping;
    conceptOptions: { code: string }[];
    unitOptions: { code: string }[];
    isExpanded: boolean;
    isUnitEnabled: boolean;
    isDetailsEnabled: boolean;
    onToggle: (columnName: string) => void;
  }) => (
    <div
      data-testid="sh-mapping-row"
      data-column-name={props.mapping.columnName}
      data-concept-options={props.conceptOptions.map(o => o.code).join(',')}
      data-unit-options={props.unitOptions.map(o => o.code).join(',')}
      data-is-expanded={String(props.isExpanded)}
      data-is-unit-enabled={String(props.isUnitEnabled)}
      data-is-details-enabled={String(props.isDetailsEnabled)}
      onClick={() => props.onToggle(props.mapping.columnName)}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EMPTY_DETAILS = {
  samplePretreatment: null,
  technique: null,
  laboratoryMethod: null,
  extractantConcentration: null,
  extractionRatio: null,
  extractionBase: null,
  measurementProcedure: null,
  limitOfDetection: null,
};

const DETAIL_OPTIONS: DetailOptionMap = {
  samplePretreatment: [],
  technique: [],
  laboratoryMethod: [],
  extractantConcentration: [],
  extractionRatio: [],
  extractionBase: [],
  measurementProcedure: [],
  limitOfDetection: [],
};

function mapping(overrides?: Partial<ColumnMapping>): ColumnMapping {
  return {
    columnName: 'file_a.tif',
    conceptId: null,
    unitId: null,
    details: { ...EMPTY_DETAILS },
    isGeometryDetectedField: false,
    ...overrides,
  };
}

function defaultProps(overrides?: Partial<React.ComponentProps<typeof RasterMappingsTable>>) {
  return {
    columnMappings: [mapping()],
    conceptOptionsByColumn: {},
    unitOptionsByConcept: {},
    detailOptions: DETAIL_OPTIONS,
    expandedRows: new Set<string>(),
    onToggleRow: jest.fn(),
    onConceptChange: jest.fn(),
    onUnitChange: jest.fn(),
    onDetailChange: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RasterMappingsTable', () => {
  it('renders the header labels', () => {
    render(<RasterMappingsTable {...defaultProps()} />);
    expect(screen.getByText('Detected layers')).toBeInTheDocument();
    expect(screen.getByText('Map to')).toBeInTheDocument();
    expect(screen.getByText('Original Unit')).toBeInTheDocument();
  });

  it('renders no rows when columnMappings is empty', () => {
    render(<RasterMappingsTable {...defaultProps({ columnMappings: [] })} />);
    expect(screen.queryAllByTestId('sh-mapping-row')).toHaveLength(0);
  });

  it('renders one row per column mapping, in order', () => {
    render(
      <RasterMappingsTable
        {...defaultProps({
          columnMappings: [mapping({ columnName: 'file_a.tif' }), mapping({ columnName: 'file_b.tif (band 1)' })],
        })}
      />,
    );
    const rows = screen.getAllByTestId('sh-mapping-row');
    expect(rows.map(r => r.getAttribute('data-column-name'))).toEqual(['file_a.tif', 'file_b.tif (band 1)']);
  });

  it('passes the concept options for the row column name, defaulting to empty when absent', () => {
    render(
      <RasterMappingsTable
        {...defaultProps({
          columnMappings: [mapping({ columnName: 'col1' }), mapping({ columnName: 'col2' })],
          conceptOptionsByColumn: { col1: [{ code: 'min_depth', name: 'Min depth' }] },
        })}
      />,
    );
    const rows = screen.getAllByTestId('sh-mapping-row');
    expect(rows[0]).toHaveAttribute('data-concept-options', 'min_depth');
    expect(rows[1]).toHaveAttribute('data-concept-options', '');
  });

  it('reflects expandedRows in isExpanded', () => {
    render(
      <RasterMappingsTable
        {...defaultProps({
          columnMappings: [mapping({ columnName: 'col1' }), mapping({ columnName: 'col2' })],
          expandedRows: new Set(['col1']),
        })}
      />,
    );
    const rows = screen.getAllByTestId('sh-mapping-row');
    expect(rows[0]).toHaveAttribute('data-is-expanded', 'true');
    expect(rows[1]).toHaveAttribute('data-is-expanded', 'false');
  });

  it('calls onToggleRow with the column name when a row is toggled', () => {
    const onToggleRow = jest.fn();
    render(<RasterMappingsTable {...defaultProps({ columnMappings: [mapping({ columnName: 'col1' })], onToggleRow })} />);
    fireEvent.click(screen.getByTestId('sh-mapping-row'));
    expect(onToggleRow).toHaveBeenCalledWith('col1');
  });

  describe('isUnitEnabled', () => {
    it('is false when the row is unmapped', () => {
      render(<RasterMappingsTable {...defaultProps({ columnMappings: [mapping({ conceptId: null })] })} />);
      expect(screen.getByTestId('sh-mapping-row')).toHaveAttribute('data-is-unit-enabled', 'false');
    });

    it('is false when the mapped concept has no unit options', () => {
      render(<RasterMappingsTable {...defaultProps({ columnMappings: [mapping({ conceptId: 'soil-ph' })], unitOptionsByConcept: {} })} />);
      expect(screen.getByTestId('sh-mapping-row')).toHaveAttribute('data-is-unit-enabled', 'false');
    });

    it('is true when the mapped concept has unit options', () => {
      render(
        <RasterMappingsTable
          {...defaultProps({
            columnMappings: [mapping({ conceptId: 'soil-ph' })],
            unitOptionsByConcept: { 'soil-ph': [{ code: 'mg/kg', name: 'mg/kg' }] },
          })}
        />,
      );
      const row = screen.getByTestId('sh-mapping-row');
      expect(row).toHaveAttribute('data-is-unit-enabled', 'true');
      expect(row).toHaveAttribute('data-unit-options', 'mg/kg');
    });
  });

  describe('isDetailsEnabled', () => {
    it('is false when the row is unmapped', () => {
      render(<RasterMappingsTable {...defaultProps({ columnMappings: [mapping({ conceptId: null })] })} />);
      expect(screen.getByTestId('sh-mapping-row')).toHaveAttribute('data-is-details-enabled', 'false');
    });

    it('is false when the mapped concept is a metadata field (min_depth/max_depth)', () => {
      render(<RasterMappingsTable {...defaultProps({ columnMappings: [mapping({ conceptId: 'min_depth' })] })} />);
      expect(screen.getByTestId('sh-mapping-row')).toHaveAttribute('data-is-details-enabled', 'false');
    });

    it('is true when the mapped concept is a soil property', () => {
      render(<RasterMappingsTable {...defaultProps({ columnMappings: [mapping({ conceptId: 'soil-ph' })] })} />);
      expect(screen.getByTestId('sh-mapping-row')).toHaveAttribute('data-is-details-enabled', 'true');
    });
  });
});
