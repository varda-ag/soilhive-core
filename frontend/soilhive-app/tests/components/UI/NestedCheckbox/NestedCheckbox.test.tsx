import { render, screen, fireEvent } from '@testing-library/react';
import { NestedCheckbox } from 'components/UI/NestedCheckbox/NestedCheckbox';

const mockItems = [
  {
    id: 'first',
    label: 'First',
    isRoot: true,
    children: [
      { id: 'first-child-1', label: 'First child 1', isRoot: false, children: [] },
      { id: 'first-child-2', label: 'First child 2', isRoot: false, children: [] },
    ],
  },
  {
    id: 'second',
    label: 'Second',
    isRoot: true,
    children: [],
  },
];

describe('NestedCheckbox', () => {
  it('renders top-level items', () => {
    const { container } = render(<NestedCheckbox items={mockItems} selected={[]} onChange={() => {}} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('calls onChange with correct values when parent is selected', () => {
    const onChange = jest.fn();
    render(<NestedCheckbox items={mockItems} selected={[]} onChange={onChange} />);

    const parentCheckbox = screen.getByLabelText(/First/i);
    fireEvent.click(parentCheckbox);

    expect(onChange).toHaveBeenCalledWith(['first', 'first-child-1', 'first-child-2']);
  });

  it('removes parent and children when unchecked', () => {
    const onChange = jest.fn();
    render(<NestedCheckbox items={mockItems} selected={['first', 'first-child-1', 'first-child-2']} onChange={onChange} />);

    const parentCheckbox = screen.getByLabelText(/First/i);
    fireEvent.click(parentCheckbox);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('toggles a single child item independently', () => {
    const onChange = jest.fn();
    render(<NestedCheckbox items={mockItems} selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('sh-plus-icon'));

    const firtsCheckboxChild = screen.getByLabelText('First child 1');
    fireEvent.click(firtsCheckboxChild);

    expect(onChange).toHaveBeenCalledWith(['first-child-1']);
  });

  it('adds className to the container', () => {
    render(<NestedCheckbox items={mockItems} selected={[]} className="custom" onChange={() => {}} />);
    expect(screen.getByTestId('nested-checkbox')).toHaveClass('custom');
  });

  it('passes isExpanded prop down to NestedCheckboxItem children', () => {
    render(<NestedCheckbox items={mockItems} isExpanded={true} selected={[]} onChange={() => {}} />);

    expect(screen.getByTestId('sh-minus-icon')).toBeInTheDocument();
    expect(screen.queryByText('First child 2')).toBeInTheDocument();
  });
});
