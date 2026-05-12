import { act, render } from '@testing-library/react';
import DownloadPreviewFilters from 'components/DownloadPreview/DownloadPreviewFilters/DownloadPreviewFilters';
import { __setIsMobileLayout } from 'hooks/useDevice';

jest.mock('primereact/dropdown', () => {
  const Dropdown = () => <div>Mock Dropdown</div>;
  return { Dropdown };
});

jest.mock('primereact/calendar', () => {
  const Calendar = () => <div>Mock Calendar</div>;
  return { Calendar };
});

jest.mock('primereact/dialog', () => {
  const Dialog = ({ children }: any) => <div>Mock Dialog {children}</div>;
  return { Dialog };
});

jest.mock('hooks/useDevice');

describe('DownloadPreviewFilters', () => {
  beforeEach(() => {
    __setIsMobileLayout(false);
  });

  it('renders the download preview filters in tablet and desktop', () => {
    const { container, queryByText } = render(<DownloadPreviewFilters />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Mock Dialog')).not.toBeInTheDocument();
  });

  it('renders the download preview filters in mobile', () => {
    __setIsMobileLayout(true);
    const { container, queryByText } = render(<DownloadPreviewFilters />);
    expect(container).toMatchSnapshot();
    expect(queryByText('Mock Dialog')).toBeInTheDocument();
  });

  it('closes the dialog if you click on "apply filters" button', async () => {
    __setIsMobileLayout(true);
    const setDialogOpenFn = jest.fn();
    const { getByText } = render(<DownloadPreviewFilters dialogOpen={true} setDialogOpen={setDialogOpenFn} />);
    const applyButton = getByText('Apply filters');
    await act(async () => applyButton.click());
    expect(setDialogOpenFn).toHaveBeenCalledWith(false);
  });

  it('does not do anything if you click on "apply filters" button and the dialog is already closed', async () => {
    __setIsMobileLayout(true);
    const setDialogOpenFn = jest.fn();
    const { getByText } = render(<DownloadPreviewFilters dialogOpen={false} setDialogOpen={setDialogOpenFn} />);
    const applyButton = getByText('Apply filters');
    await act(async () => applyButton.click());
    expect(setDialogOpenFn).not.toHaveBeenCalled();
  });
});
