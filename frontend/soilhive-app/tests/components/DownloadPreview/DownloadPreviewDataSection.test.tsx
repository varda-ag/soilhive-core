import { render } from '@testing-library/react';
import DownloadPreviewDataSection from 'components/DownloadPreview/DownloadPreviewDataSection';

jest.mock('components/DownloadPreview/DownloadPreviewFilters', () => {
  const DownloadPreviewFilters = () => <div>Mock DownloadPreviewFilters</div>;
  return DownloadPreviewFilters;
});

jest.mock('components/DownloadPreview/DownloadPreviewTable', () => {
  const DownloadPreviewTable = () => <div>Mock DownloadPreviewTable</div>;
  return DownloadPreviewTable;
});

describe('DownloadPreviewDataSection', () => {
  it('renders the download preview data section', () => {
    const { container } = render(<DownloadPreviewDataSection />);
    expect(container).toMatchSnapshot();
  });
});
