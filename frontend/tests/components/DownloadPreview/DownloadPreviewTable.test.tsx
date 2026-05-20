import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DownloadPreviewTable from 'components/DownloadPreview/DownloadPreviewTable/DownloadPreviewTable';
import type { SoilDataSample } from 'types/backend';

jest.mock('primereact/multiselect', () => {
  const MultiSelect = () => <div>Mock Multiselect</div>;
  return { MultiSelect };
});

jest.mock('primereact/datatable', () => {
  const DataTable = ({
    children,
    onRowClick,
    value,
  }: {
    children: React.ReactNode;
    onRowClick?: (event: { data: unknown }) => void;
    value?: unknown[];
  }) => (
    <div>
      Mock DataTable {children}
      {value?.map((item, index) => (
        <div key={index} data-testid={`row-${index}`} onClick={() => onRowClick?.({ data: item })} />
      ))}
    </div>
  );
  return { DataTable };
});

jest.mock('primereact/column', () => {
  const Column = () => <div>Mock Column</div>;
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
  soil_property: 'pH',
  property_acronym: 'ph',
  standard_unit: 'unitless',
  value: 7.2,
  geometry: null,
  license_name: 'CC-BY',
  sampling_date: '2023-05-01',
  min_depth: 0,
  max_depth: 30,
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
});
