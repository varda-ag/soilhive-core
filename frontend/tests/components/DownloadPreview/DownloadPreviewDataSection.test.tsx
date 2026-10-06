import { act, render } from '@testing-library/react';
import DownloadPreviewDataSection from 'components/DownloadPreview/DownloadPreviewDataSection/DownloadPreviewDataSection';

jest.mock('components/DownloadPreview/DownloadPreviewFilters/DownloadPreviewFilters', () => {
  const DownloadPreviewFilters = () => <div>Mock DownloadPreviewFilters</div>;
  return DownloadPreviewFilters;
});

jest.mock('components/DownloadPreview/DownloadPreviewTable/DownloadPreviewTable', () => {
  const DownloadPreviewTable = ({ isRasterDataset }: { isRasterDataset?: boolean }) => (
    <div>Mock DownloadPreviewTable{isRasterDataset ? ' for a raster dataset' : ''}</div>
  );
  return DownloadPreviewTable;
});

describe('DownloadPreviewDataSection', () => {
  it('renders the download preview data section', () => {
    const { container, getByTestId } = render(<DownloadPreviewDataSection />);
    expect(container).toMatchSnapshot();
    const filtersButton = getByTestId('download-preview-data-section-filters-button');
    expect(filtersButton.classList.contains('Secondary')).toBe(true);
  });

  it('changes the button type when clicking on it', async () => {
    const { container, getByTestId } = render(<DownloadPreviewDataSection />);
    expect(container).toMatchSnapshot();
    const filtersButton = getByTestId('download-preview-data-section-filters-button');
    await act(async () => filtersButton.click());
    expect(filtersButton.classList.contains('Secondary')).toBe(false);
  });

  it('shows the table for a raster dataset too, telling it the dataset is raster', () => {
    const { queryByText } = render(<DownloadPreviewDataSection isRasterDataset={true} />);
    expect(queryByText('Mock DownloadPreviewTable for a raster dataset')).toBeInTheDocument();
  });

  it('shows the table for a vector dataset', () => {
    const { queryByText } = render(<DownloadPreviewDataSection isRasterDataset={false} />);
    expect(queryByText('Mock DownloadPreviewTable')).toBeInTheDocument();
  });
});
