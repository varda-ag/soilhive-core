import { act, render } from '@testing-library/react';
import DownloadPreviewFilters from 'components/DownloadPreview/DownloadPreviewFilters/DownloadPreviewFilters';
import { __setIsMobileLayout } from 'hooks/useDevice';
import { trackEvent } from 'utilities/analytics';

jest.mock('utilities/analytics', () => ({ trackEvent: jest.fn() }));

const mockDropdownProps = jest.fn();
jest.mock('primereact/dropdown', () => {
  const Dropdown = (props: any) => {
    mockDropdownProps(props);
    return <div>Mock Dropdown</div>;
  };
  return { Dropdown };
});

const mockCalendarProps = jest.fn();
jest.mock('primereact/calendar', () => {
  const Calendar = (props: any) => {
    mockCalendarProps(props);
    return <div>Mock Calendar</div>;
  };
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
  describe('usage analytics', () => {
    // The dropdowns of the last render: datasets, soil property, depth
    const dropdowns = () => mockDropdownProps.mock.calls.slice(-3).map(([props]) => props);
    const calendar = () => mockCalendarProps.mock.lastCall[0];

    beforeEach(() => jest.clearAllMocks());

    it('sends the dataset and the soil property picked, by name', () => {
      render(
        <DownloadPreviewFilters
          datasets={[{ id: 'ds-1', name: 'Dataset 1' }]}
          soilProperties={[{ id: 'ph', property_name: 'pH' } as any]}
          isLoading={false}
        />,
      );

      act(() => dropdowns()[0].onChange({ value: 'ds-1' }));
      act(() => dropdowns()[1].onChange({ value: 'ph' }));

      expect(trackEvent).toHaveBeenNthCalledWith(1, 'explore_filter_change', { filter_name: 'dataset', filter_value: 'Dataset 1' });
      expect(trackEvent).toHaveBeenNthCalledWith(2, 'explore_filter_change', { filter_name: 'soil_property', filter_value: 'pH' });
    });

    it('sends the depth range picked, and none when it is cleared', () => {
      render(<DownloadPreviewFilters isLoading={false} />);

      act(() => dropdowns()[2].onChange({ value: '15-30' }));
      act(() => dropdowns()[2].onChange({ value: null }));

      expect(trackEvent).toHaveBeenNthCalledWith(1, 'explore_filter_change', { filter_name: 'depth', filter_value: '15-30cm' });
      expect(trackEvent).toHaveBeenNthCalledWith(2, 'explore_filter_change', { filter_name: 'depth', filter_value: 'none' });
    });

    it('sends the months picked once the calendar closes, and nothing when they did not change', () => {
      const { rerender } = render(<DownloadPreviewFilters isLoading={false} filters={{ soil_properties: [] }} />);

      act(() => calendar().onChange({ value: [new Date(2020, 0, 15), new Date(2020, 5, 15)] }));
      act(() => calendar().onHide());

      expect(trackEvent).toHaveBeenCalledWith('explore_filter_change', { filter_name: 'date_range', filter_value: '2020-01 to 2020-06' });

      (trackEvent as jest.Mock).mockClear();
      rerender(
        <DownloadPreviewFilters
          isLoading={false}
          filters={{ soil_properties: [], min_sampling_date: '2020-01-01', max_sampling_date: '2020-06-30' }}
        />,
      );
      act(() => calendar().onHide());

      expect(trackEvent).not.toHaveBeenCalled();
    });
  });
});
