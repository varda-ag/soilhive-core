import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarParameters } from 'components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters';
import type { NestedCheckboxItemType } from 'types/components';

const mockProperties: NestedCheckboxItemType[] = [
  {
    id: '1',
    label: 'First',
    isRoot: true,
    children: [
      {
        id: '1-1',
        label: 'First-First',
        isRoot: false,
        children: [
          { id: '1-1-1', label: 'First first first', isRoot: false, children: [] },
          { id: '1-1-2', label: 'First first second', isRoot: false, children: [] },
        ],
      },
      {
        id: '1-2',
        label: 'First-Second',
        isRoot: false,
        children: [],
      },
    ],
  },
  {
    id: '2',
    label: 'Second',
    isRoot: true,
    children: [
      { id: '2-1', label: 'Second-First', isRoot: false, children: [] },
      { id: '2-2', label: 'Second-Second', isRoot: false, children: [] },
    ],
  },
];

jest.mock('../../../../src/contexts/AvailabilityContext', () => {
  const mockSetDatasetFilters = jest.fn();
  const mockSetSelectedSoilProperties = jest.fn();

  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      setDatasetFilters: mockSetDatasetFilters,
      setSelectedSoilProperties: mockSetSelectedSoilProperties,
      selectedSoilProperties: [],
      allSoilProperties: [],
      filteredSoilProperties: [],
    }),
    mockSetDatasetFilters,
    mockSetSelectedSoilProperties,
  };
});

const { mockSetDatasetFilters } = jest.requireMock('../../../../src/contexts/AvailabilityContext');

jest.mock('components/UI', () => ({
  Accordion: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="accordion">
      <div data-testid="accordion-title">{title}</div>
      <div data-testid="accordion-content">{children}</div>
    </div>
  ),
  SelectionPills: () => null,
  NestedCheckbox: ({
    items,
    selected,
    isExpanded,
    onChange,
  }: {
    items: NestedCheckboxItemType[];
    selected: string[];
    isExpanded: boolean;
    onChange: (selected: string[]) => void;
  }) => {
    const [localSelected, setLocalSelected] = React.useState(selected);

    const handleClick = () => {
      const newSelection = [items[0].id];
      setLocalSelected(newSelection);
      onChange(newSelection);
    };

    return (
      <div data-testid="nested-checkbox" data-expanded={isExpanded}>
        <div data-testid="nested-checkbox-items">{JSON.stringify(items)}</div>
        <div data-testid="nested-checkbox-selected">{JSON.stringify(localSelected)}</div>
        <button data-testid="nested-checkbox-change" onClick={handleClick} />
      </div>
    );
  },
  Toggle: ({ labelOne, labelTwo, isToggled, onToggled, className }: any) => (
    <div data-testid="global-toggle" onClick={onToggled} className={className}>
      {isToggled ? labelTwo : labelOne}
    </div>
  ),
}));

describe('FilteringSidebarParameters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(React, 'useMemo').mockReturnValue(mockProperties);
  });
  it('renders four accordion components', () => {
    const { container } = render(<FilteringSidebarParameters />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(4);
    expect(container).toMatchSnapshot();
    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(0);
  });

  it('changes selected parameters on the nested checbox component change', () => {
    render(<FilteringSidebarParameters />);

    fireEvent.click(screen.getByTestId('nested-checkbox-change'));

    expect(screen.getByTestId('nested-checkbox-selected')).toHaveTextContent('["1"]');
    expect(mockSetDatasetFilters).toHaveBeenCalledTimes(1);

    // updaterFn is the function that was passed to setDatasetFilter in the original component and caught by
    // the mockSetDatasetFilters
    const updaterFn = mockSetDatasetFilters.mock.calls[0][0];
    const prevFilters = { mock: 'data' };
    const result = updaterFn(prevFilters);

    // in this way we verify that just the geompetries are updated, but not the rest of the filters
    expect(result).toEqual({
      mock: 'data',
      soil_properties: ['1'],
    });
  });

  it('toggles the expansion state when the toggle is clicked', () => {
    render(<FilteringSidebarParameters />);

    const toggle = screen.getByTestId('global-toggle');
    const checkox = screen.getByTestId('nested-checkbox');

    fireEvent.click(toggle);

    expect(checkox).toHaveAttribute('data-expanded', 'false');

    fireEvent.click(toggle);

    expect(checkox).toHaveAttribute('data-expanded', 'false');
  });
});
