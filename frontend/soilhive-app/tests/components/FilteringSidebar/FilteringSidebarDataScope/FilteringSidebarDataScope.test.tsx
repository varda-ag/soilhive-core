import { render, screen, fireEvent } from '@testing-library/react';
import { FilteringSidebarDataScope } from 'components/FilteringSidebar/FilteringSidebarDataScope/FilteringSidebarDataScope';

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
  it('renders 3 accordion components', () => {
    const { container } = render(<FilteringSidebarDataScope />);

    expect(container).toMatchSnapshot();
  });

  it('Data type: selecting an item shows pillsSlot, removing pill clears it', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-point')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-select-point'));

    expect(screen.getByTestId('pill-point')).toBeInTheDocument();
    expect(screen.getByTestId('pill-point')).toHaveTextContent('Point');

    fireEvent.click(screen.getByTestId('pill-remove-point'));

    expect(screen.queryByTestId('pill-point')).not.toBeInTheDocument();
  });

  it('Data access: selecting an item shows pillsSlot, removing pill clears it', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-private')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-select-private'));

    expect(screen.getByTestId('pill-private')).toBeInTheDocument();
    expect(screen.getByTestId('pill-private')).toHaveTextContent('Private');

    fireEvent.click(screen.getByTestId('pill-remove-private'));
    expect(screen.queryByTestId('pill-private')).not.toBeInTheDocument();
  });

  it('Time: applying time filter shows time pill and removing it clears it', () => {
    render(<FilteringSidebarDataScope />);

    expect(screen.queryByTestId('pill-time')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-timefilter-apply'));

    expect(screen.getByTestId('pill-time')).toBeInTheDocument();
    expect(screen.getByTestId('pill-time')).toHaveTextContent('2000-2010');

    fireEvent.click(screen.getByTestId('pill-remove-time'));

    expect(screen.queryByTestId('pill-time')).not.toBeInTheDocument();
  });

  it('supports multiple selections in Data type', () => {
    render(<FilteringSidebarDataScope />);

    fireEvent.click(screen.getByTestId('mock-select-point'));
    fireEvent.click(screen.getByTestId('mock-select-raster'));

    expect(screen.getByTestId('pill-point')).toBeInTheDocument();
    expect(screen.getByTestId('pill-raster')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-select-raster'));
    expect(screen.queryByTestId('pill-raster')).not.toBeInTheDocument();
    expect(screen.getByTestId('pill-point')).toBeInTheDocument();
  });
});
