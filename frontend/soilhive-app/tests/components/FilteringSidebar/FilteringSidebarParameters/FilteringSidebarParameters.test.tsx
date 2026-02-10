import React, { type Ref } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FilteringSidebarParameters } from 'components/FilteringSidebar/FilteringSidebarParameters/FilteringSidebarParameters';
import type { NestedCheckboxItemType, NestedCheckboxRef } from 'types/components';
import useSoilPropertiesFilters from 'hooks/useSoilPropertiesFilters';

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

jest.mock('hooks/useSoilPropertiesFilters', () => ({
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
  Accordion: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="accordion">
      <div data-testid="accordion-title">{title}</div>
      <div data-testid="accordion-content">{children}</div>
    </div>
  ),
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
    nestedSoilProperties: mockProperties,
    selectedSoilProperties: [],
    pillSelections: [],
    handleOnChange: mockHandleOnChange,
    handlePillRemove: mockHandlePillRemove,
  };

  beforeEach(() => {
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue(defaultHookValue);
    jest.spyOn(React, 'useMemo').mockReturnValue(mockProperties);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it('renders accordion components', () => {
    const { container } = render(<FilteringSidebarParameters />);

    const accordions = screen.getAllByTestId('accordion');
    expect(accordions).toHaveLength(1);
    expect(container).toMatchSnapshot();
  });

  it('changes selected parameters on the nested checbox component change', () => {
    render(<FilteringSidebarParameters />);

    fireEvent.click(screen.getByTestId('nested-checkbox-change'));

    expect(screen.getByTestId('nested-checkbox-selected')).toHaveTextContent('["1"]');
    expect(mockHandleOnChange).toHaveBeenCalledTimes(1);
    expect(mockHandleOnChange).toHaveBeenCalledWith(['1']);
  });

  it('toggles the expansion state when the toggle is clicked', () => {
    render(<FilteringSidebarParameters />);

    const toggle = screen.getByTestId('global-toggle');
    const checkox = screen.getByTestId('nested-checkbox');

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

    fireEvent.click(screen.getByTestId('nested-checkbox-toggle-visibility'));

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.queryByText('Collapse All')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    (useSoilPropertiesFilters as jest.Mock).mockReturnValue({ ...defaultHookValue, isLoading: true });

    render(<FilteringSidebarParameters />);

    expect(screen.queryByTestId('skeleton-container')).toBeInTheDocument();
  });
});
