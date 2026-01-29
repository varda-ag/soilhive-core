import { render, screen, fireEvent } from '@testing-library/react';
import { FilteringSidebarDataScope } from 'components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope';
import useAvailability from 'hooks/useAvailability';

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/UI', () => ({
  __esModule: true,

  Accordion: ({ title, pillsSlot, children }: any) => (
    <section data-testid={`mock-accordion-${title}`}>
      <h2>{title}</h2>
      <div data-testid={`mock-accordion-pills-${title}`}>{pillsSlot}</div>
      <div data-testid={`mock-accordion-content-${title}`}>{children}</div>
    </section>
  ),

  MultiselectButtons: ({ items, selected, onChange }: any) => (
    <div data-testid="mock-multiselect">
      {items.map((it: any) => (
        <button
          key={it.id}
          type="button"
          data-testid={`mock-select-${it.id}`}
          onClick={() => {
            const next = selected.includes(it.id) ? selected.filter((x: string) => x !== it.id) : [...selected, it.id];
            onChange(next);
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  ),

  SelectionPills: ({ selections, onRemove }: any) => (
    <div data-testid="mock-pills">
      {selections.map((s: any) => (
        <span key={s.id} data-testid={`pill-${s.id}`}>
          {s.label}
          <button type="button" data-testid={`pill-remove-${s.id}`} onClick={() => onRemove(s.id)}>
            remove
          </button>
        </span>
      ))}
    </div>
  ),
}));

jest.mock('components/FilteringSidebar/FilteringSidebarDataScope/TimeFilter/TimeFilter', () => ({
  __esModule: true,
  TimeFilter: ({ initialState, onChange }: any) => (
    <div data-testid="mock-timefilter">
      <div data-testid="mock-timefilter-initial">
        {initialState?.min ?? 'no-min'}-{initialState?.max ?? 'no-max'}
      </div>
      <button type="button" data-testid="mock-timefilter-apply" onClick={() => onChange({ min: 2000, max: 2010 })}>
        apply-time
      </button>
    </div>
  ),
}));

describe('FilteringSidebarDataScope', () => {
  const mockSetFrontendFilters = jest.fn();
  const mockSetDatasetFilters = jest.fn();

  beforeEach(() => {
    (useAvailability as jest.Mock).mockReturnValue({
      datasetFrontendFilters: { type: [], ownership: [] },
      typeFilterOptions: ['point', 'raster', 'polygonal'],
      setFrontendFilters: mockSetFrontendFilters,
      setDatasetFilters: mockSetDatasetFilters,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders 3 accordion components', () => {
    const { container } = render(<FilteringSidebarDataScope />);

    expect(container).toMatchSnapshot();
  });

  it('Data type: sets frontend filter on the type select', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-point')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-select-point'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['point'], 'type');
  });

  it('Data type: shows pillsSlot if filter is selected and clears filter on pill removing', () => {
    (useAvailability as jest.Mock).mockReturnValueOnce({
      datasetFrontendFilters: { type: ['point'], ownership: [] },
      typeFilterOptions: ['point', 'raster', 'polygonal'],
      setFrontendFilters: mockSetFrontendFilters,
      setDatasetFilters: mockSetDatasetFilters,
    });

    render(<FilteringSidebarDataScope />);

    expect(screen.getByTestId('pill-point')).toBeInTheDocument();
    expect(screen.getByTestId('pill-point')).toHaveTextContent('Point');

    fireEvent.click(screen.getByTestId('pill-remove-point'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith([], 'type');
  });

  it('Data type: supports multiple selections', () => {
    (useAvailability as jest.Mock).mockReturnValueOnce({
      datasetFrontendFilters: { type: ['point'], ownership: [] },
      typeFilterOptions: ['point', 'raster', 'polygonal'],
      setFrontendFilters: mockSetFrontendFilters,
      setDatasetFilters: mockSetDatasetFilters,
    });

    render(<FilteringSidebarDataScope />);

    fireEvent.click(screen.getByTestId('mock-select-raster'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['point', 'raster'], 'type');
  });

  it('Data access: sets frontend filter on the ownership select', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-private')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-select-private'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['private'], 'ownership');
  });

  it('Data access: shows pillsSlot if filter is selected and clears filter on pill removing', () => {
    (useAvailability as jest.Mock).mockReturnValueOnce({
      datasetFrontendFilters: { type: [], ownership: ['private'] },
      typeFilterOptions: ['point', 'raster', 'polygonal'],
      setFrontendFilters: mockSetFrontendFilters,
      setDatasetFilters: mockSetDatasetFilters,
    });

    render(<FilteringSidebarDataScope />);

    expect(screen.getByTestId('pill-private')).toBeInTheDocument();
    expect(screen.getByTestId('pill-private')).toHaveTextContent('Private');

    fireEvent.click(screen.getByTestId('pill-remove-private'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith([], 'ownership');
  });

  it('Time: applying time filter shows time pill and removing it clears it', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-time')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-timefilter-apply'));

    expect(screen.getByTestId('pill-time')).toBeInTheDocument();
    expect(screen.getByTestId('pill-time')).toHaveTextContent('2000-2010');
    expect(screen.queryByTestId('mock-timefilter-apply')).not.toBeInTheDocument();

    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(1);

    const setFilterCallbackFunction = mockSetDatasetFilters.mock.calls[0][0];
    expect(typeof setFilterCallbackFunction).toBe('function');

    const { min_sampling_date, max_sampling_date } = setFilterCallbackFunction({});

    expect(new Date(min_sampling_date).getFullYear()).toBe(2000);
    expect(new Date(max_sampling_date).getFullYear()).toBe(2010);

    fireEvent.click(screen.getByTestId('pill-remove-time'));

    expect(screen.queryByTestId('pill-time')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-timefilter-apply')).toBeInTheDocument();

    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(2);

    const resetFilterCallbackFunction = mockSetDatasetFilters.mock.calls[1][0];
    expect(typeof resetFilterCallbackFunction).toBe('function');

    expect(resetFilterCallbackFunction({})).toEqual({
      min_sampling_date: undefined,
      max_sampling_date: undefined,
    });
  });
});
