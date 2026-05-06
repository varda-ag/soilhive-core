import React from 'react';
import { render, screen } from '@testing-library/react';
import DownloadPreviewTable from 'components/DownloadPreview/DownloadPreviewTable/DownloadPreviewTable';

jest.mock('primereact/multiselect', () => {
  const MultiSelect = () => <div>Mock Multiselect</div>;
  return { MultiSelect };
});

jest.mock('primereact/datatable', () => {
  const DataTable = ({ children }: { children: React.ReactNode }) => <div>Mock DataTable {children}</div>;
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
});
