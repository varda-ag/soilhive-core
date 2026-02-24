import React from 'react';
import { render } from '@testing-library/react';
import DownloadPreviewTable from 'components/DownloadPreview/DownloadPreviewTable/DownloadPreviewTable';

jest.mock('../../../src/contexts/AvailabilityContext', () => {
  return {
    __esModule: true,
    AvailabilityContext: React.createContext({}),
  };
});

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
});
