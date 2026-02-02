import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
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

  it('toggles visibility on a single item independently', () => {
    const onChange = jest.fn();
    render(<NestedCheckbox items={mockItems} selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('sh-plus-icon'));

    expect(screen.getByLabelText('First child 1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sh-minus-icon'));

    expect(screen.queryByLabelText('First child 1')).not.toBeInTheDocument();
  });

  it('expandAll and collapsAll functionslity works as expected', () => {
    const ref = React.createRef<any>();
    render(<NestedCheckbox ref={ref} items={mockItems} selected={[]} onChange={() => {}} />);

    expect(ref.current).toBeTruthy();

    act(() => {
      ref.current.expandAll();
    });

    expect(screen.getByTestId('sh-minus-icon')).toBeInTheDocument();
    expect(screen.getByText('First child 2')).toBeInTheDocument();

    act(() => {
      ref.current.collapseAll();
    });

    expect(screen.queryByTestId('sh-minus-icon')).not.toBeInTheDocument();
    expect(screen.queryByText('First child 2')).not.toBeInTheDocument();
  });
});
