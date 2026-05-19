import { render, screen, fireEvent } from '@testing-library/react';
import { NestedCheckboxItem } from 'components/UI/NestedCheckbox/NestedCheckboxItem/NestedCheckboxItem';
import type { NestedCheckboxItemType } from 'types/components';
import { __setIsMobileLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

jest.mock('components/UI/Checkbox/Checkbox', () => ({
  Checkbox: ({ label, value, indeterminate, size, onChange }: any) => (
    <div
      data-testid="mock-checkbox"
      data-value={value}
      data-indeterminate={indeterminate}
      data-size={size}
      onClick={() => onChange(!value)}
    >
      {label}
    </div>
  ),
}));

const mockItem: NestedCheckboxItemType = {
  id: 'root',
  label: 'Root item',
  isRoot: true,
  children: [
    { id: 'child-1', label: 'Child 1', isRoot: false, children: [] },
    { id: 'child-2', label: 'Child 2', isRoot: false, children: [] },
  ],
};

describe('NestedCheckboxItem', () => {
  const mockOnToggle = jest.fn();
  const mockOnToggleVisibility = jest.fn();
  const defaultProps = {
    item: mockItem,
    selected: [],
    expandedIds: [],
    onToggle: mockOnToggle,
    onToggleVisibility: mockOnToggleVisibility,
  };

  beforeEach(() => {
    __setIsMobileLayout(false);
  });

  it('renders the checkbox with label', () => {
    const { container } = render(<NestedCheckboxItem {...defaultProps} />);

    expect(screen.getByText('Root item')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls onToggle when checkbox is clicked', () => {
    render(<NestedCheckboxItem {...defaultProps} />);

    fireEvent.click(screen.getByTestId('mock-checkbox'));

    expect(mockOnToggle).toHaveBeenCalledWith(mockItem, true);
  });

  it('toggles children visibility when plus icon is clicked', () => {
    render(<NestedCheckboxItem {...defaultProps} />);

    const toggleIcon = screen.getByTestId('sh-plus-icon');
    fireEvent.click(toggleIcon);

    expect(mockOnToggleVisibility).toHaveBeenCalledWith(mockItem.id, true);
  });

  it('does not render children when item has none', () => {
    const rootItem: NestedCheckboxItemType = { id: 'root', label: 'Root', isRoot: true, children: [] };

    render(<NestedCheckboxItem {...defaultProps} item={rootItem} />);

    expect(screen.queryByTestId('sh-plus-icon')).not.toBeInTheDocument();
  });

  it('shows intermidiate state when some children are selected', () => {
    render(<NestedCheckboxItem {...defaultProps} selected={['child-1']} />);

    const checkbox = screen.getByTestId('mock-checkbox');
    expect(checkbox).toHaveAttribute('data-indeterminate', 'true');
    expect(checkbox).toHaveAttribute('data-value', 'false');
  });

  it('shows check state when all childrent are selected', () => {
    render(<NestedCheckboxItem {...defaultProps} selected={['child-1', 'child-2']} />);

    const chekcbox = screen.getByTestId('mock-checkbox');
    expect(chekcbox).toHaveAttribute('data-indeterminate', 'false');
    expect(chekcbox).toHaveAttribute('data-value', 'true');
  });

  it('shows unchecked state when no children is selected', () => {
    render(<NestedCheckboxItem {...defaultProps} />);

    expect(screen.getByTestId('mock-checkbox')).toHaveAttribute('data-indeterminate', 'false');
    expect(screen.getByTestId('mock-checkbox')).toHaveAttribute('data-value', 'false');
  });

  it('uses size="small" on desktop layout', () => {
    render(<NestedCheckboxItem {...defaultProps} />);

    expect(screen.getByTestId('mock-checkbox')).toHaveAttribute('data-size', 'small');
  });

  it('uses size="medium" on mobile layout', () => {
    __setIsMobileLayout(true);

    render(<NestedCheckboxItem {...defaultProps} />);

    expect(screen.getByTestId('mock-checkbox')).toHaveAttribute('data-size', 'medium');
  });

  it('expands automatically when expandedIds contains item.id', () => {
    render(<NestedCheckboxItem {...defaultProps} expandedIds={['root']} />);

    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
  });
});
