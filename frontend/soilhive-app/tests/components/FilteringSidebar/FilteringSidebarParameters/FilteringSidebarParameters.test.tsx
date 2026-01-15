import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarParameters } from 'components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters';
import type { NestedCheckboxItemType } from 'types/components';

const mockProperties: NestedCheckboxItemType[] = [
  {
    id: '1',
    label: 'First',
    children: [
      {
        id: '1-1',
        label: 'First-First',
        children: [
          { id: '1-1-1', label: 'First first first' },
          { id: '1-1-2', label: 'First first second' },
        ],
      },
      {
        id: '1-2',
        label: 'First-Second',
      },
    ],
  },
  {
    id: '2',
    label: 'Second',
    children: [
      { id: '2-1', label: 'Second-First' },
      { id: '2-2', label: 'Second-Second' },
    ],
  },
];

jest.mock('../../../../src/contexts/AvailabilityContext', () => {
  const mockSetDatasetFilters = jest.fn();

  return {
    __esModule: true,
    AvailabilityContext: React.createContext({
      setDatasetFilters: mockSetDatasetFilters,
    }),
    mockSetDatasetFilters,
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
  NestedCheckbox: ({
    items,
    selected,
    onChange,
  }: {
    items: NestedCheckboxItemType[];
    selected: string[];
    onChange: (selected: string[]) => void;
  }) => (
    <div data-testid="nested-checkbox">
      <div data-testid="nested-checkbox-items">{JSON.stringify(items)}</div>
      <div data-testid="nested-checkbox-selected">{JSON.stringify(selected)}</div>
      <button data-testid="nested-checkbox-change" onClick={() => onChange([items[0].id])} />
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
});
