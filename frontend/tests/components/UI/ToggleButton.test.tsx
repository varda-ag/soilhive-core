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

  it('names the checkbox with ariaLabel', () => {
    const { getByRole } = render(<ToggleButton ariaLabel="Allow access requests" />);
    expect(getByRole('checkbox', { name: 'Allow access requests' })).toBeInTheDocument();
  });

  it('describes the checkbox with the element ariaDescribedBy names', () => {
    const { getByRole } = render(
      <>
        <p id="what-it-does">Users can ask for access</p>
        <ToggleButton ariaDescribedBy="what-it-does" />
      </>,
    );
    expect(getByRole('checkbox')).toHaveAccessibleDescription('Users can ask for access');
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
  it('puts data-analytics on the checkbox, not the label around it, so a click on the label counts once', () => {
    const { container } = render(<ToggleButton dataAnalytics="dai_toggle" />);
    expect(getCheckbox(container)).toHaveAttribute('data-analytics', 'dai_toggle');
    expect(container.querySelectorAll('[data-analytics]')).toHaveLength(1);
  });
});
