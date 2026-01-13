import { render, screen, fireEvent } from '@testing-library/react';
import { NestedCheckboxItem } from 'components/UI/NestedCheckbox/NestedCheckboxItem/NestedCheckboxItem';
import type { NestedCheckboxItemType } from 'types/components';

jest.mock('components/UI/Checkbox/Checkbox', () => ({
  Checkbox: ({ label, value, onChange }: any) => (
    <div data-testid="mock-checkbox" onClick={() => onChange(!value)}>
      {label}
    </div>
  ),
}));

const mockItem: NestedCheckboxItemType = {
  id: 'root',
  label: 'Root item',
  children: [
    { id: 'child-1', label: 'Child 1' },
    { id: 'child-2', label: 'Child 2' },
  ],
};

describe('NestedCheckboxItem', () => {
  it('renders the checkbox with label', () => {
    render(<NestedCheckboxItem item={mockItem} selected={[]} onToggle={jest.fn()} />);

    expect(screen.getByText('Root item')).toBeInTheDocument();
  });

  it('calls onToggle when checkbox is clicked', () => {
    const onToggle = jest.fn();

    render(<NestedCheckboxItem item={mockItem} selected={[]} onToggle={onToggle} />);

    fireEvent.click(screen.getByTestId('mock-checkbox'));

    expect(onToggle).toHaveBeenCalledWith(mockItem, true);
  });

  it('toggles children visibility when plus icon is clicked', () => {
    const { container } = render(<NestedCheckboxItem item={mockItem} selected={[]} onToggle={jest.fn()} />);

    const toggleIcon = screen.getByTestId('sh-plus-icon');
    fireEvent.click(toggleIcon);

    expect(screen.getByTestId('sh-minus-icon')).toBeInTheDocument();
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('does not render children when item has none', () => {
    const rootItem: NestedCheckboxItemType = { id: 'root', label: 'Root' };

    render(<NestedCheckboxItem item={rootItem} selected={[]} onToggle={jest.fn()} />);

    expect(screen.queryByTestId('sh-plus-icon')).not.toBeInTheDocument();
  });
});
