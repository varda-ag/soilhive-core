import { render, screen, fireEvent } from '@testing-library/react';
import { MultiselectButtons } from 'components/UI/MultiselectButtons/MultiselectButtons';

describe('MultiselectButtons', () => {
  const items = [
    { id: 'a', label: 'Option A' },
    { id: 'b', label: 'Option B' },
    { id: 'c', label: 'Option C' },
  ];

  it('renders component', () => {
    const { container } = render(<MultiselectButtons items={items} selected={[]} onChange={jest.fn()} />);
    expect(screen.getByTestId('sh-ui-multiselect-buttons')).toBeInTheDocument();
    expect(screen.getAllByTestId('sh-ui-multiselect-button')).toHaveLength(3);
    expect(container).toMatchSnapshot();
  });

  it('accepts additional className', () => {
    const { container } = render(<MultiselectButtons className="test-class" items={items} selected={[]} onChange={jest.fn()} />);

    expect(container.querySelector('.test-class')).toBeInTheDocument();
  });

  it('accepts additional className for buttons', () => {
    const { container } = render(
      <MultiselectButtons buttonClassName="test-button-class" items={items} selected={[]} onChange={jest.fn()} />,
    );

    expect(container.querySelector('.test-button-class')).toBeInTheDocument();
  });

  it('marks checkboxes as checked if their id is in selected', () => {
    render(<MultiselectButtons items={items} selected={['b']} onChange={jest.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(false);
  });

  it('adds id to selected list when checkbox becomes checked', () => {
    const onChange = jest.fn();

    render(<MultiselectButtons items={items} selected={['a']} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('removes id from selected list when checkbox becomes unchecked', () => {
    const onChange = jest.fn();

    render(<MultiselectButtons items={items} selected={['a', 'b']} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['a']);
  });
});
