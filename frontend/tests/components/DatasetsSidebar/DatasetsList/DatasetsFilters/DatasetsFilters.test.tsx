import { act, render, screen, fireEvent } from '@testing-library/react';
import { DatasetsFilters } from 'components/DatasetsSidebar/DatasetsList/DatasetsFilters/DatasetsFilters';
import useAvailability from 'hooks/useAvailability';
import { trackEvent } from 'utilities/analytics';

jest.mock('utilities/analytics', () => ({ trackEvent: jest.fn() }));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/UI', () => ({
  __esModule: true,
  TextInput: ({ value, onChange, placeholder }: any) => (
    <input data-testid="mock-textinput" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  ),
}));

describe('DatasetsFilters', () => {
  const mockSetSearchValue = jest.fn();

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      searchValue: '',
      setSearchValue: mockSetSearchValue,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders component', () => {
    const { container } = render(<DatasetsFilters />);

    expect(container).toMatchSnapshot();
  });

  it('search input updates searchValue', () => {
    render(<DatasetsFilters />);

    const input = screen.getByTestId('mock-textinput');

    fireEvent.change(input, { target: { value: 'soil' } });
    expect(mockSetSearchValue).toHaveBeenCalledWith('soil');
  });
  describe('usage analytics', () => {
    const availability = (searchValue: string) => ({ searchValue, setSearchValue: mockSetSearchValue, datasets: [{}, {}] });

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('sends the text typed once it stopped changing for a second, with the number of datasets it matches', () => {
      (useAvailability as jest.Mock).mockReturnValue(availability(''));
      const { rerender } = render(<DatasetsFilters />);
      fireEvent.change(screen.getByTestId('mock-textinput'), { target: { value: ' soil ' } });
      (useAvailability as jest.Mock).mockReturnValue(availability(' soil '));
      rerender(<DatasetsFilters />);

      act(() => jest.advanceTimersByTime(999));
      expect(trackEvent).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));

      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith('dataset_name_search', { dataset_name_search_text: 'soil', result_count: 2 });
    });

    it('sends nothing for a single character', () => {
      (useAvailability as jest.Mock).mockReturnValue(availability(''));
      const { rerender } = render(<DatasetsFilters />);
      fireEvent.change(screen.getByTestId('mock-textinput'), { target: { value: 's' } });
      (useAvailability as jest.Mock).mockReturnValue(availability('s'));
      rerender(<DatasetsFilters />);

      act(() => jest.advanceTimersByTime(2000));

      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('sends nothing for the text a sign-in brought back', () => {
      (useAvailability as jest.Mock).mockReturnValue(availability('soil'));
      render(<DatasetsFilters />);

      act(() => jest.advanceTimersByTime(2000));

      expect(trackEvent).not.toHaveBeenCalled();
    });
  });
});
