import { render, screen, fireEvent } from '@testing-library/react';
import { FilteringSidebarDataScope } from 'components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope';
import useDataScopeFilters from 'hooks/useDataScopeFilters';

jest.mock('hooks/useDataScopeFilters', () => ({
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
  const mockTypeFilterPillRemove = jest.fn();
  const mockAccessFilterPillRemove = jest.fn();
  const mockHandleTimeFilterChange = jest.fn();

  const defaultHookValue = {
    isLoading: false,
    datasetFrontendFilters: { type: [], ownership: [] },
    typeFilterOptions: [
      { id: 'point', label: 'Point' },
      { id: 'raster', label: 'Raster' },
      { id: 'polygonal', label: 'Polygonal' },
    ],
    typeFilterPills: [],
    accessFilterOptions: [
      { id: 'private', label: 'Private' },
      { id: 'public', label: 'Public' },
    ],
    accessFilterPills: [],
    timeFilterPills: null,
    typeFilterPillRemove: mockTypeFilterPillRemove,
    accessFilterPillRemove: mockAccessFilterPillRemove,
    handleTimeFilterChange: mockHandleTimeFilterChange,
    setFrontendFilters: mockSetFrontendFilters,
  };

  beforeEach(() => {
    (useDataScopeFilters as jest.Mock).mockReturnValue(defaultHookValue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders 3 accordion components', () => {
    const { container } = render(<FilteringSidebarDataScope />);

    expect(container).toMatchSnapshot();
  });

  it('Data type: sets type frontend filter on the type select', () => {
    render(<FilteringSidebarDataScope />);

    fireEvent.click(screen.getByTestId('mock-select-point'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['point'], 'type');
  });

  it('Data type: shows pillsSlot if filter is selected and calls typeFilterPillRemove on pill removing', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValueOnce({
      ...defaultHookValue,
      datasetFrontendFilters: { type: ['point'], ownership: [] },
      typeFilterPills: [{ id: 'point', label: 'Point' }],
    });

    render(<FilteringSidebarDataScope />);

    expect(screen.getByTestId('pill-point')).toBeInTheDocument();
    expect(screen.getByTestId('pill-point')).toHaveTextContent('Point');

    fireEvent.click(screen.getByTestId('pill-remove-point'));

    expect(mockTypeFilterPillRemove).toHaveBeenCalledWith('point');
  });

  it('Data type: supports multiple selections', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValueOnce({
      ...defaultHookValue,
      datasetFrontendFilters: { type: ['point'], ownership: [] },
      typeFilterPills: [{ id: 'point', label: 'Point' }],
    });

    render(<FilteringSidebarDataScope />);

    fireEvent.click(screen.getByTestId('mock-select-raster'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['point', 'raster'], 'type');
  });

  it('Data access: sets frontend filter on the ownership select', () => {
    render(<FilteringSidebarDataScope />);

    fireEvent.click(screen.getByTestId('mock-select-private'));

    expect(mockSetFrontendFilters).toHaveBeenCalledWith(['private'], 'ownership');
  });

  it('Data access: shows pillsSlot if filter is selected and clears filter on pill removing', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValueOnce({
      ...defaultHookValue,
      datasetFrontendFilters: { type: [], ownership: ['private'] },
      accessFilterPills: [{ id: 'private', label: 'Private' }],
    });

    render(<FilteringSidebarDataScope />);

    expect(screen.getByTestId('pill-private')).toBeInTheDocument();
    expect(screen.getByTestId('pill-private')).toHaveTextContent('Private');

    fireEvent.click(screen.getByTestId('pill-remove-private'));

    expect(mockAccessFilterPillRemove).toHaveBeenCalledWith('private');
  });

  it('Time: renders time filter if there is no selected time range', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-time')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-timefilter-apply')).toBeInTheDocument();
  });

  it('Time: pill removing calls handleTimeFilterChange with empty object', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValueOnce({
      ...defaultHookValue,
      timeFilterPills: [{ id: 'time', label: '2000-2010' }],
    });
    render(<FilteringSidebarDataScope />);

    expect(screen.getByTestId('pill-time')).toBeInTheDocument();
    expect(screen.getByTestId('pill-time')).toHaveTextContent('2000-2010');
    expect(screen.queryByTestId('mock-timefilter-apply')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pill-remove-time'));

    expect(mockHandleTimeFilterChange).toHaveBeenCalledWith({});
  });

  it('renders loading state', () => {
    (useDataScopeFilters as jest.Mock).mockReturnValueOnce({
      ...defaultHookValue,
      isLoading: true,
    });

    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('skeleton-container-data-type')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-container-time')).toBeInTheDocument();
  });
});
