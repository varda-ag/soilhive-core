import { render } from '@testing-library/react';
import DownloadPreviewFilters from 'components/DownloadPreview/DownloadPreviewFilters/DownloadPreviewFilters';

describe('DownloadPreviewFilters', () => {
  it('renders the download preview filters', () => {
    const { container } = render(<DownloadPreviewFilters />);
    expect(container).toMatchSnapshot();
  });
});
