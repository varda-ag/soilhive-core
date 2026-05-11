import { act, render } from '@testing-library/react';
import DownloadPreviewDataSection from 'components/DownloadPreview/DownloadPreviewDataSection/DownloadPreviewDataSection';

jest.mock('components/DownloadPreview/DownloadPreviewFilters/DownloadPreviewFilters', () => {
  const DownloadPreviewFilters = () => <div>Mock DownloadPreviewFilters</div>;
  return DownloadPreviewFilters;
});

jest.mock('components/DownloadPreview/DownloadPreviewTable/DownloadPreviewTable', () => {
  const DownloadPreviewTable = () => <div>Mock DownloadPreviewTable</div>;
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
});
