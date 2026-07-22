import { jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react';
import { ToggleButton } from 'components/UI/ToggleButton/ToggleButton';

const getCheckbox = (container: HTMLElement) => container.querySelector('input[type="checkbox"]') as HTMLInputElement;

describe('ToggleButton', () => {
  it('renders a checkbox input', () => {
    const { container } = render(<ToggleButton />);
    expect(getCheckbox(container)).toBeInTheDocument();
  });

  it('reflects checked=true on the checkbox', () => {
    const { container } = render(<ToggleButton checked={true} onChange={() => {}} />);
    expect(getCheckbox(container)).toBeChecked();
  });

  it('reflects checked=false on the checkbox', () => {
    const { container } = render(<ToggleButton checked={false} onChange={() => {}} />);
    expect(getCheckbox(container)).not.toBeChecked();
  });

  it('calls onChange with true when an unchecked checkbox is clicked', () => {
    const onChange = jest.fn();
    const { container } = render(<ToggleButton checked={false} onChange={onChange} />);
    fireEvent.click(getCheckbox(container));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when a checked checkbox is clicked', () => {
    const onChange = jest.fn();
    const { container } = render(<ToggleButton checked={true} onChange={onChange} />);
    fireEvent.click(getCheckbox(container));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('disables the checkbox when disabled=true', () => {
    const { container } = render(<ToggleButton disabled />);
    expect(getCheckbox(container)).toBeDisabled();
  });

  it('applies the Disabled class to the label when disabled=true', () => {
    const { container } = render(<ToggleButton disabled />);
    expect(container.firstChild).toHaveClass('Disabled');
  });

  it('does not apply the Disabled class when not disabled', () => {
    const { container } = render(<ToggleButton />);
    expect(container.firstChild).not.toHaveClass('Disabled');
  });

  it('applies the Medium class by default', () => {
    const { container } = render(<ToggleButton />);
    expect(container.firstChild).toHaveClass('Medium');
  });

  it('applies the Small class when size=small', () => {
    const { container } = render(<ToggleButton size="small" />);
    expect(container.firstChild).toHaveClass('Small');
  });

  it('applies the Tiny class when size=tiny', () => {
    const { container } = render(<ToggleButton size="tiny" />);
    expect(container.firstChild).toHaveClass('Tiny');
  });
});
