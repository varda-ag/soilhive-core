import { render, screen, fireEvent } from '@testing-library/react';
import { MultiselectButton } from 'components/UI/MultiselectButtons/MultiselectButton/MultiselectButton';

describe('MultiselectButton', () => {
  it('renders unhecked checkbox when selected=false', () => {
    const { container } = render(<MultiselectButton id="opt-1" label="Option 1" selected={false} onChange={jest.fn()} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(screen.getByTestId('sh-ui-multiselect-button')).toBeInTheDocument();
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
    expect(container).toMatchSnapshot();
  });

  it('accepts additional className', () => {
    const { container } = render(
      <MultiselectButton className="test-class" id="opt-1" label="Option 1" selected={false} onChange={jest.fn()} />,
    );

    expect(container.querySelector('.test-class')).toBeInTheDocument();
  });

  it('checkbox is checked when selected=true', () => {
    render(<MultiselectButton id="opt-1" label="Option 1" selected={true} onChange={jest.fn()} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('calls onChange with (true, id) when checked', () => {
    const onChange = jest.fn();

    render(<MultiselectButton id="opt-1" label="Option 1" selected={false} onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true, 'opt-1');
  });

  it('calls onChange with (false, id) when unchecked', () => {
    const onChange = jest.fn();

    render(<MultiselectButton id="opt-1" label="Option 1" selected={true} onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false, 'opt-1');
  });

  it('renders wrapper test id', () => {
    render(<MultiselectButton id="opt-1" label="Option 1" selected={false} onChange={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-multiselect-button')).toBeInTheDocument();
  });
});
