import React, { type Ref } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarParameters } from 'components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters';
import type { NestedCheckboxItemType, NestedCheckboxRef, AccordionRef } from 'types/components';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';
import { useRasterFilters } from 'hooks/useRasterFilters';
import useAvailability from 'hooks/useAvailability';

const mockCategorizedSoilProperties = [
  {
    id: 'biological',
    category_name: 'Biological',
    nodes: [
      {
        id: 'b-1',
        label: 'B1',
        isRoot: true,
        children: [
          { id: 'b-1-1', label: 'First first first', isRoot: false, children: [] },
          { id: 'b-1-2', label: 'First first second', isRoot: false, children: [] },
        ],
      },
      { id: 'b-2', label: 'B2', isRoot: true, children: [] },
    ],
  },
  {
    id: 'chemical',
    category_name: 'Chemical',
    nodes: [{ id: 'c-1', label: 'C1', isRoot: true, children: [] }],
  },
];

jest.mock('hooks/useDevice');

jest.mock('hooks/useSoilPropertiesFilters', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useRasterFilters', () => ({
  __esModule: true,
  useRasterFilters: jest.fn(),
}));

jest.mock('hooks/useAvailability', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type NestedCheckboxPropsType = {
  ref: Ref<NestedCheckboxRef>;
  items: NestedCheckboxItemType[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onToggleVisibility?: (expandedIds: string[]) => void;
};

jest.mock('components/UI', () => ({
  Accordion: ({
    ref,
    title,
    onToggle,
    children,
  }: {
    ref: Ref<AccordionRef>;
    title: string;
    onToggle: (isExpanded: boolean) => void;
    children: React.ReactNode;
  }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    React.useImperativeHandle(
      ref,
      () => ({
        expand() {
          setIsExpanded(true);
        },

        collapse() {
          setIsExpanded(false);
        },
      }),
      [],
    );

    return (
      <div data-testid="accordion" data-open={String(isExpanded)}>
        <div
          data-testid={`accordion-header-${title}`}
          role="button"
          onClick={() => {
            setIsExpanded(!isExpanded);
            onToggle?.(!isExpanded);
          }}
        >
          {title}
        </div>
        <div data-testid="accordion-content">{children}</div>
      </div>
    );
  },
  SelectionPills: () => null,
  NestedCheckbox: ({ ref, items, selected, onChange, onToggleVisibility }: NestedCheckboxPropsType) => {
    const [localSelected, setLocalSelected] = React.useState(selected);
    const [isExpanded, setIsExpanded] = React.useState<boolean>(false);

    const handleClick = () => {
      const newSelection = [items[0].id];
      setLocalSelected(newSelection);
      onChange(newSelection);
    };

    React.useImperativeHandle(
      ref,
      () => ({
        expandAll() {
          setIsExpanded(true);
        },

        collapseAll() {
          setIsExpanded(false);
        },
      }),
      [],
    );

    return (
      <div data-testid="nested-checkbox" data-expanded={isExpanded}>
        <div data-testid="nested-checkbox-items">{JSON.stringify(items)}</div>
        <div data-testid="nested-checkbox-selected">{JSON.stringify(localSelected)}</div>
        <button data-testid="nested-checkbox-change" onClick={handleClick} />
        <button data-testid="nested-checkbox-toggle-visibility" onClick={() => onToggleVisibility?.(['1'])} />
      </div>
    );
  },
  Toggle: ({ labelOne, labelTwo, isToggled, onToggle, className }: any) => (
    <div data-testid="global-toggle" onClick={onToggle} className={className}>
      {isToggled ? labelTwo : labelOne}
    </div>
  ),
}));

describe('FilteringSidebarParameters', () => {
  const mockHandleOnChange = jest.fn();
  const mockHandlePillRemove = jest.fn();

  const defaultHookValue = {
    isLoading: false,
    isNoData: false,
    isNoFilteredData: false,
    categorizedSoilProperties: mockCategorizedSoilProperties,
    selectedSoilProperties: [],
    pillSelections: [],
    handleOnChange: mockHandleOnChange,
    handlePillRemove: mockHandlePillRemove,
  };

  const deafultRasterFilters = {
    categoryData: [],
    isLoading: false,
    selectedValues: [],
    handleOnChange: jest.fn(),
  };

  beforeEach(() => {
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue(defaultHookValue);
    (useRasterFilters as jest.Mock).mockReturnValue(deafultRasterFilters);
    (useAvailability as jest.Mock).mockReturnValue({ isLoading: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it('renders accordion components', () => {
    const { container } = render(<FilteringSidebarParameters />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(3);

    expect(screen.getByTestId('accordion-header-Soil Properties')).toBeInTheDocument();
    expect(screen.getByTestId('accordion-header-Biological')).toBeInTheDocument();
    expect(screen.getByTestId('accordion-header-Chemical')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('changes selected parameters on the nested checbox component change', () => {
    render(<FilteringSidebarParameters />);

    fireEvent.click(screen.getAllByTestId('nested-checkbox-change')[0]);

    expect(screen.getAllByTestId('nested-checkbox-selected')[0]).toHaveTextContent('["b-1"]');
    expect(mockHandleOnChange).toHaveBeenCalledTimes(1);
    expect(mockHandleOnChange).toHaveBeenCalledWith(['b-1']);
  });

  it('toggles the expansion state when the toggle is clicked', () => {
    render(<FilteringSidebarParameters />);

    const toggle = screen.getByTestId('global-toggle');
    const checkox = screen.getAllByTestId('nested-checkbox')[0];

    fireEvent.click(toggle);

    expect(checkox).toHaveAttribute('data-expanded', 'true');

    fireEvent.click(toggle);

    expect(checkox).toHaveAttribute('data-expanded', 'false');
  });

  it('toggles the expansion state when the single item was toggled in the nested checkbox', () => {
    render(<FilteringSidebarParameters />);

    const toggle = screen.getByTestId('global-toggle');

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.queryByText('Collapse All')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText('Collapse All')).toBeInTheDocument();
    expect(screen.queryByText('Expand All')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('nested-checkbox-toggle-visibility')[0]);

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.queryByText('Collapse All')).not.toBeInTheDocument();
  });

  it('toggles the expansion state when the single accordion was toggled', () => {
    render(<FilteringSidebarParameters />);

    const toggle = screen.getByTestId('global-toggle');

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.queryByText('Collapse All')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByText('Collapse All')).toBeInTheDocument();
    expect(screen.queryByText('Expand All')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('accordion-header-Biological'));

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.queryByText('Collapse All')).not.toBeInTheDocument();
  });

  it('expands all properties on the search', () => {
    render(<FilteringSidebarParameters />);

    const input = screen.getByPlaceholderText('Search soil properties');

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.queryByText('Collapse All')).not.toBeInTheDocument();

    act(() => {
      fireEvent.change(input, { target: { value: 'B1' } });
    });

    expect(screen.getByText('Collapse All')).toBeInTheDocument();
    expect(screen.queryByText('Expand All')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue({ ...defaultHookValue, isLoading: true });

    render(<FilteringSidebarParameters />);

    expect(screen.queryByTestId('skeleton-container')).toBeInTheDocument();
  });
});
