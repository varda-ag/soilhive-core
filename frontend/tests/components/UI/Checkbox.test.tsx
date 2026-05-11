import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from 'components/UI/Checkbox/Checkbox';

describe('Checkbox component', () => {
  it('renders the checkbox', () => {
    render(<Checkbox />);
    expect(screen.getByTestId('sh-ui-checkbox')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<Checkbox label="Accept Terms" />);
    expect(screen.getByTestId('sh-ui-checkbox-label')).toBeInTheDocument();
  });

  it('does NOT render label when not provided', () => {
    render(<Checkbox />);
    expect(screen.queryByTestId('sh-ui-checkbox-label')).not.toBeInTheDocument();
  });

  it('sets initial checked value from props', () => {
    render(<Checkbox value={true} />);
    const input = screen.getByRole('checkbox') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('calls onChange when clicked', () => {
    const handleChange = jest.fn();
    render(<Checkbox onChange={handleChange} name="agree" />);

    const input = screen.getByRole('checkbox');

    fireEvent.click(input);

    expect(handleChange).toHaveBeenCalledWith(true, 'agree');
  });

  it('does not allow clicking when disabled', () => {
    const handleChange = jest.fn();
    render(<Checkbox isDisabled={true} onChange={handleChange} />);

    const input = screen.getByRole('checkbox') as HTMLInputElement;

    expect(input.disabled).toBe(true);

    fireEvent.click(input);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies error class when isError=true', () => {
    render(<Checkbox isError={true} />);
    expect(screen.getByTestId('sh-ui-checkbox')).toHaveClass('Error');
  });

  it('updates when new value prop is received', () => {
    const { rerender } = render(<Checkbox value={false} />);

    const input = screen.getByRole('checkbox') as HTMLInputElement;
    expect(input.checked).toBe(false);

    rerender(<Checkbox value={true} />);
    expect(input.checked).toBe(true);
  });

  it('applies correct size class', () => {
    render(<Checkbox size="small" />);

    expect(screen.getByTestId('sh-ui-checkbox')).toHaveClass('Small');
  });

  it('adds Marginless class when no label is provided', () => {
    render(<Checkbox />);
    expect(screen.getByTestId('sh-ui-checkbox')).toHaveClass('Marginless');
  });

  it('matches snapshot', () => {
    const { container } = render(<Checkbox value={true} label="Accept" name="agree" size="small" isError={true} />);

    expect(container).toMatchSnapshot();
  });

  it('applies Indeterminate class when indeterminate=true', () => {
    render(<Checkbox indeterminate={true} />);
    expect(screen.getByTestId('sh-ui-checkbox')).toHaveClass('Indeterminate');
  });

  it('does not apply Checked class when indeterminate=true even if checked=true', () => {
    render(<Checkbox value={true} indeterminate={true} />);
    expect(screen.getByTestId('sh-ui-checkbox')).toHaveClass('Indeterminate');
    expect(screen.getByTestId('sh-ui-checkbox')).not.toHaveClass('Checked');
  });

  it('applies Checked class when indeterminate=false and value=true', () => {
    render(<Checkbox value={true} />);
    expect(screen.getByTestId('sh-ui-checkbox')).toHaveClass('Checked');
  });
});
