import { render } from '@testing-library/react';
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
    const { container } = render(<DownloadPreviewDataSection />);
    expect(container).toMatchSnapshot();
  });
});
