import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import DownloadPreviewTable from 'components/DownloadPreview/DownloadPreviewTable/DownloadPreviewTable';
import { GISDataType, type SoilDataSample } from 'types/backend';

// Props are recorded so tests can read the columns offered and shown without rendering PrimeReact
const mockMultiSelect = jest.fn();
const mockDataTable = jest.fn();
const mockColumn = jest.fn();

jest.mock('primereact/multiselect', () => {
  const MultiSelect = (props: unknown) => {
    mockMultiSelect(props);
    return <div>Mock Multiselect</div>;
  };
  return { MultiSelect };
});

jest.mock('primereact/datatable', () => {
  const DataTable = (props: { children: React.ReactNode; onRowClick?: (event: { data: unknown }) => void; value?: unknown[] }) => {
    mockDataTable(props);
    const { children, onRowClick, value } = props;
    return (
      <div>
        Mock DataTable {children}
        {value?.map((item, index) => (
          <div key={index} data-testid={`row-${index}`} onClick={() => onRowClick?.({ data: item })} />
        ))}
      </div>
    );
  };
  return { DataTable };
});

jest.mock('primereact/column', () => {
  const Column = (props: unknown) => {
    mockColumn(props);
    return <div>Mock Column</div>;
  };
  return { Column };
});

jest.mock('primereact/api', () => {
  const PrimeReactProvider = ({ children }: { children: React.ReactNode }) => <div>Mock PrimeReactProvider {children}</div>;
  return { PrimeReactProvider };
});

const sampleBase: SoilDataSample = {
  id: 'sample-1',
  dataset: 'ds-1',
  dataset_name: 'Dataset 1',
  gis_datatype: GISDataType.POINT,
  soil_property: 'pH',
  property_acronym: 'ph',
  standard_unit: 'unitless',
  value: 7.2,
  value_label: null,
  geometry: null,
  license_name: 'CC-BY',
  sampling_date: '2023-05-01',
  min_depth: 0,
  max_depth: 30,
  resolution_m: null,
  reference_period_start: null,
  reference_period_stop: null,
  sample_pretreatment: null,
  technique: null,
  laboratory_method: null,
  extractant_concentration: null,
  extraction_ratio: null,
  extraction_base: null,
  measurement_procedure: null,
  limit_of_detection: null,
  cursor: 'cursor-1',
};

const sampleWithGeometry: SoilDataSample = {
  ...sampleBase,
  id: 'sample-geo',
  geometry: { type: 'Point', coordinates: [10, 20] },
};

const sampleWithoutGeometry: SoilDataSample = {
  ...sampleBase,
  id: 'sample-no-geo',
  geometry: null,
};

describe('DownloadPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders download preview page', () => {
    const { container } = render(<DownloadPreviewTable isDataLoading={false} />);
    expect(container).toMatchSnapshot();
  });

  it('renders the loading download preview page', () => {
    const { container } = render(<DownloadPreviewTable isDataLoading={true} />);
    expect(container).toMatchSnapshot();
  });

  it('metadata button links to the selected dataset and opens in a new tab when not loading', () => {
    render(<DownloadPreviewTable isDataLoading={false} selectedDatasets={['dataset-1']} />);

    const link = screen.getByText(/metadata/i).closest('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', '/datasets/dataset-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('metadata button is disabled while data is loading', () => {
    render(<DownloadPreviewTable isDataLoading={true} selectedDatasets={['dataset-1']} />);

    const button = screen.getByText(/metadata/i).closest('button');
    expect(button).not.toBeNull();
    expect(button).toBeDisabled();
    expect(screen.getByText(/metadata/i).closest('a')).toBeNull();
  });

  it('metadata button is disabled when no dataset is selected', () => {
    render(<DownloadPreviewTable isDataLoading={false} />);

    const button = screen.getByText(/metadata/i).closest('button');
    expect(button).not.toBeNull();
    expect(button).toBeDisabled();
    expect(screen.getByText(/metadata/i).closest('a')).toBeNull();
  });

  it('calls onFeatureSelected with the row feature when clicking a row with geometry', () => {
    const onFeatureSelected = jest.fn();
    render(<DownloadPreviewTable isDataLoading={false} data={[sampleWithGeometry]} onFeatureSelected={onFeatureSelected} />);

    fireEvent.click(screen.getByTestId('row-0'));
    expect(onFeatureSelected).toHaveBeenCalledTimes(1);
    expect(onFeatureSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Feature',
        geometry: sampleWithGeometry.geometry,
      }),
    );
  });

  it('does not call onFeatureSelected when clicking a row without geometry', () => {
    const onFeatureSelected = jest.fn();
    render(<DownloadPreviewTable isDataLoading={false} data={[sampleWithoutGeometry]} onFeatureSelected={onFeatureSelected} />);

    fireEvent.click(screen.getByTestId('row-0'));
    expect(onFeatureSelected).not.toHaveBeenCalled();
  });

  it('does not throw when clicking a row with geometry and no onFeatureSelected handler', () => {
    render(<DownloadPreviewTable isDataLoading={false} data={[sampleWithGeometry]} />);
    expect(() => fireEvent.click(screen.getByTestId('row-0'))).not.toThrow();
  });

  describe('for a raster dataset', () => {
    type ColumnProps = { field?: string; sortable?: boolean; body?: (sample: SoilDataSample) => React.ReactNode };
    const lastMultiSelect = () =>
      mockMultiSelect.mock.lastCall![0] as { options: { value: string }[]; value: string[]; onChange: (e: { value: string[] }) => void };
    const lastColumns = () => {
      const columns = mockColumn.mock.calls.map(([props]) => props as ColumnProps).filter(props => props.field);
      return columns.slice(-lastMultiSelect().value.length);
    };
    const rasterSample: SoilDataSample = {
      ...sampleBase,
      gis_datatype: GISDataType.RASTER,
      value: Math.fround(6.2869),
      sampling_date: null,
      resolution_m: 250,
      reference_period_start: '2010',
      reference_period_stop: '2020-06',
    };

    it('shows the reference period in place of the date, and offers Resolution without showing it', () => {
      render(<DownloadPreviewTable isDataLoading={false} isRasterDataset />);

      const { options, value } = lastMultiSelect();
      expect(options.map(option => option.value)).toEqual(expect.arrayContaining(['reference_period', 'resolution_m']));
      expect(options.map(option => option.value)).not.toContain('sampling_date');
      expect(value).toContain('reference_period');
      expect(value).not.toContain('resolution_m');
    });

    it('turns sorting off, on the columns and on the table', () => {
      render(<DownloadPreviewTable isDataLoading={false} isRasterDataset />);

      expect(lastColumns().every(column => column.sortable === false)).toBe(true);
      expect(mockDataTable.mock.lastCall![0]).toMatchObject({ sortField: undefined, sortOrder: undefined });
    });

    it('keeps sorting on for a vector dataset', () => {
      render(<DownloadPreviewTable isDataLoading={false} />);

      expect(lastColumns().every(column => column.sortable === true)).toBe(true);
    });

    it('shows the value to Float32 precision, and the reference period as a range', () => {
      render(<DownloadPreviewTable isDataLoading={false} isRasterDataset data={[rasterSample]} />);

      const byField = Object.fromEntries(lastColumns().map(column => [column.field, column]));
      expect(byField['value']!.body!(rasterSample)).toBe(6.2869);
      expect(byField['reference_period']!.body!(rasterSample)).toBe('2010 – 2020-06');
      expect(byField['reference_period']!.body!({ ...rasterSample, reference_period_stop: '2010' })).toBe('2010');
      expect(byField['reference_period']!.body!({ ...rasterSample, reference_period_start: null, reference_period_stop: null })).toBe('-');
    });

    it('carries the date column choice across kinds of dataset, and keeps Resolution for when it returns', () => {
      const { rerender } = render(<DownloadPreviewTable isDataLoading={false} />);
      act(() => lastMultiSelect().onChange({ value: lastMultiSelect().value.filter(key => key !== 'sampling_date') }));

      rerender(<DownloadPreviewTable isDataLoading={false} isRasterDataset />);
      expect(lastMultiSelect().value).not.toContain('reference_period');
      act(() => lastMultiSelect().onChange({ value: [...lastMultiSelect().value, 'resolution_m'] }));

      rerender(<DownloadPreviewTable isDataLoading={false} />);
      expect(lastMultiSelect().value).not.toContain('resolution_m');

      rerender(<DownloadPreviewTable isDataLoading={false} isRasterDataset />);
      expect(lastMultiSelect().value).toContain('resolution_m');
    });
  });
});
