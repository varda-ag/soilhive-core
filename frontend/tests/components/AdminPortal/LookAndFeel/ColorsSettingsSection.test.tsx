import { render, screen, fireEvent } from '@testing-library/react';
import { ColorsSettingsSection } from 'components/AdminPortal/LookAndFeel/ColorsSettingsSection/ColorsSettingsSection';
import useLookAndFeel from 'hooks/useLookAndFeel';

jest.mock('hooks/useLookAndFeel', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/AdminPortal/LookAndFeel/ColorsSettingsField/ColorsSettingsField', () => ({
  ColorsSettingsField: ({ name, tooltipLabel, tooltipText }: any) => (
    <div data-testid={`field-${name}`} data-tooltip-label={tooltipLabel} data-tooltip-text={tooltipText} />
  ),
}));

describe('ColorsSettingsSection', () => {
  const handleColorChange = jest.fn();

  const colors = {
    'primary-default': '#ff0000',
    'primary-hover': '#cc0000',
    'primary-text': '#ffffff',
    'secondary-default': '#0000ff',
    'secondary-hover': '#0000cc',
  };

  const baseProps = {
    name: 'test-section',
    fields: [{ name: 'primary-default' }, { name: 'primary-hover' }],
  };

  beforeEach(() => {
    (useLookAndFeel as jest.Mock).mockReturnValue({ colors, handleColorChange });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders a field for each entry in fields', () => {
    render(<ColorsSettingsSection {...baseProps} />);

    expect(screen.getByTestId('field-primary-default')).toBeInTheDocument();
    expect(screen.getByTestId('field-primary-hover')).toBeInTheDocument();
  });

  it('passes tooltip props when field.tooltip is true', () => {
    const props = {
      name: 'test-section',
      fields: [{ name: 'primary-default', tooltip: true }],
    };

    render(<ColorsSettingsSection {...props} />);

    const field = screen.getByTestId('field-primary-default');
    expect(field.getAttribute('data-tooltip-label')).toBeTruthy();
    expect(field.getAttribute('data-tooltip-text')).toBeTruthy();
  });

  it('does not pass tooltip props when field.tooltip is false', () => {
    render(<ColorsSettingsSection {...baseProps} />);

    const field = screen.getByTestId('field-primary-default');
    expect(field.getAttribute('data-tooltip-label')).toBeNull();
    expect(field.getAttribute('data-tooltip-text')).toBeNull();
  });

  it('does not render action buttons when neither applyPrimary nor applySecondary is set', () => {
    render(<ColorsSettingsSection {...baseProps} />);

    expect(screen.queryByTestId('sh-ui-button')).not.toBeInTheDocument();
  });

  it('renders one button when only applyPrimary is true', () => {
    render(<ColorsSettingsSection {...baseProps} applyPrimary />);

    expect(screen.getAllByTestId('sh-ui-button')).toHaveLength(1);
  });

  it('renders one button when only applySecondary is true', () => {
    render(<ColorsSettingsSection {...baseProps} applySecondary />);

    expect(screen.getAllByTestId('sh-ui-button')).toHaveLength(1);
  });

  it('renders two buttons when both applyPrimary and applySecondary are true', () => {
    render(<ColorsSettingsSection {...baseProps} applyPrimary applySecondary />);

    expect(screen.getAllByTestId('sh-ui-button')).toHaveLength(2);
  });

  it('onApplyPrimary copies primary colors to the first two fields', () => {
    render(<ColorsSettingsSection {...baseProps} applyPrimary />);

    fireEvent.click(screen.getByTestId('sh-ui-button'));

    expect(handleColorChange).toHaveBeenCalledTimes(2);
    expect(handleColorChange).toHaveBeenCalledWith('primary-default', colors['primary-default']);
    expect(handleColorChange).toHaveBeenCalledWith('primary-hover', colors['primary-hover']);
  });

  it('onApplyPrimary also applies primary-text when fields has 3 entries', () => {
    const props = {
      ...baseProps,
      fields: [{ name: 'some-default' }, { name: 'some-hover' }, { name: 'some-text' }],
      applyPrimary: true as const,
    };

    render(<ColorsSettingsSection {...props} />);

    fireEvent.click(screen.getByTestId('sh-ui-button'));

    expect(handleColorChange).toHaveBeenCalledTimes(3);
    expect(handleColorChange).toHaveBeenCalledWith('some-default', colors['primary-default']);
    expect(handleColorChange).toHaveBeenCalledWith('some-hover', colors['primary-hover']);
    expect(handleColorChange).toHaveBeenCalledWith('some-text', colors['primary-text']);
  });

  it('onApplySecondary copies secondary colors to the first two fields', () => {
    render(<ColorsSettingsSection {...baseProps} applySecondary />);

    fireEvent.click(screen.getByTestId('sh-ui-button'));

    expect(handleColorChange).toHaveBeenCalledTimes(2);
    expect(handleColorChange).toHaveBeenCalledWith('primary-default', colors['secondary-default']);
    expect(handleColorChange).toHaveBeenCalledWith('primary-hover', colors['secondary-hover']);
  });

  it('when both buttons are present, the first applies primary and the second applies secondary', () => {
    render(<ColorsSettingsSection {...baseProps} applyPrimary applySecondary />);

    const [primaryButton, secondaryButton] = screen.getAllByTestId('sh-ui-button');

    fireEvent.click(primaryButton);
    expect(handleColorChange).toHaveBeenCalledWith('primary-default', colors['primary-default']);
    expect(handleColorChange).toHaveBeenCalledWith('primary-hover', colors['primary-hover']);

    jest.clearAllMocks();

    fireEvent.click(secondaryButton);
    expect(handleColorChange).toHaveBeenCalledWith('primary-default', colors['secondary-default']);
    expect(handleColorChange).toHaveBeenCalledWith('primary-hover', colors['secondary-hover']);
  });
});
