//import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RasterFilter } from 'components/FilteringSidebar/RasterFilter/RasterFilter';
import { useRasterFilters } from 'hooks/useRasterFilters';

jest.mock('hooks/useRasterFilters', () => ({
  useRasterFilters: jest.fn(),
}));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Minimal mocks that render just enough for us to assert on
jest.mock('components/UI', () => ({
  Accordion: ({ title, children, pillsSlot }: any) => (
    <div data-testid="mock-accordion">
      <span data-testid="accordion-title">{title}</span>
      {pillsSlot}
      {children}
    </div>
  ),
  SelectionPills: ({ selections, onRemove }: any) => (
    <div data-testid="mock-selection-pills">
      {selections.map((s: any) => (
        <button key={s.id} data-testid={`pill-${s.id}`} onClick={() => onRemove(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('components/UI/Checkbox/Checkbox', () => ({
  Checkbox: ({ label, value, onChange }: any) => (
    <input type="checkbox" aria-label={label} checked={value} onChange={e => onChange(e.target.checked)} />
  ),
}));

const useRasterFiltersMock = useRasterFilters as jest.MockedFunction<typeof useRasterFilters>;

function buildHookMock(overrides = {}) {
  return {
    category: {
      id: 'soil_groups',
      name: 'Soil Groups',
      description: 'World Reference Base for Soil Resources',
      enabled: true,
      mapping: { Acrisols: 1, Ferralsols: 2, Gleysols: 3 },
    },
    availableOptions: [
      { label: 'Acrisols', value: 1 },
      { label: 'Ferralsols', value: 2 },
      { label: 'Gleysols', value: 3 },
    ],
    selectedValues: [],
    pillSelections: [],
    handleOnChange: jest.fn(),
    handlePillRemove: jest.fn(),
    isLoadingRasterCategories: false,
    ...overrides,
  };
}

describe('RasterFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing if category is undefined', () => {
    useRasterFiltersMock.mockReturnValue(buildHookMock({ category: undefined }) as any);

    const { container } = render(<RasterFilter categoryId="soil_groups" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing if category is disabled', () => {
    useRasterFiltersMock.mockReturnValue(buildHookMock({ category: { ...buildHookMock().category, enabled: false } }) as any);

    const { container } = render(<RasterFilter categoryId="soil_groups" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the accordion with the category name as title', () => {
    useRasterFiltersMock.mockReturnValue(buildHookMock() as any);

    render(<RasterFilter categoryId="soil_groups" />);

    expect(screen.getByTestId('accordion-title')).toHaveTextContent('Soil Groups');
  });

  it('renders a checkbox for each available option', () => {
    useRasterFiltersMock.mockReturnValue(buildHookMock() as any);

    render(<RasterFilter categoryId="soil_groups" />);

    expect(screen.getByRole('checkbox', { name: 'Acrisols' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Ferralsols' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Gleysols' })).toBeInTheDocument();
  });

  it('calls handleOnChange with added value when a checkbox is checked', () => {
    const handleOnChange = jest.fn();
    useRasterFiltersMock.mockReturnValue(buildHookMock({ handleOnChange, selectedValues: [] }) as any);

    render(<RasterFilter categoryId="soil_groups" />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Acrisols' }));

    expect(handleOnChange).toHaveBeenCalledWith([1]);
  });

  it('filters checkboxes based on the search term', () => {
    useRasterFiltersMock.mockReturnValue(buildHookMock() as any);

    render(<RasterFilter categoryId="soil_groups" />);

    fireEvent.change(screen.getByPlaceholderText('Search soil groups'), {
      target: { value: 'acri' },
    });

    expect(screen.getByRole('checkbox', { name: 'Acrisols' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Ferralsols' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Gleysols' })).not.toBeInTheDocument();
  });

  it('renders SelectionPills and calls handlePillRemove when a pill is clicked', () => {
    const handlePillRemove = jest.fn();
    useRasterFiltersMock.mockReturnValue(
      buildHookMock({
        handlePillRemove,
        pillSelections: [{ id: '1', label: 'Acrisols', disabled: false }],
      }) as any,
    );

    render(<RasterFilter categoryId="soil_groups" />);

    expect(screen.getByTestId('mock-selection-pills')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pill-1'));
    expect(handlePillRemove).toHaveBeenCalledWith('1');
  });
});
