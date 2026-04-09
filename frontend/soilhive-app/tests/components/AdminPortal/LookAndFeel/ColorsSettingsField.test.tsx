import { render, screen, fireEvent } from '@testing-library/react';
import { ColorsSettingsField } from 'components/AdminPortal/LookAndFeel/ColorsSettingsField/ColorsSettingsField';

jest.mock('components/UI', () => ({
  ColorPicker: ({ onChange }: any) => <input data-testid="mock-color-picker" onChange={e => onChange(e.target.value)} />,
  TextInput: ({ label, onChange }: any) => (
    <input data-testid="mock-text-input" aria-label={label} onChange={e => onChange(e.target.value)} />
  ),
}));

jest.mock('react-tooltip', () => ({
  Tooltip: ({ id }: any) => <div data-testid={`tooltip-${id}`} />,
}));

describe('ColorsSettingsField', () => {
  const onChange = jest.fn();

  const baseProps = {
    label: 'Primary color',
    name: 'primary-default',
    onChange,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders ColorPicker and TextInput', () => {
    render(<ColorsSettingsField {...baseProps} />);

    expect(screen.getByTestId('mock-color-picker')).toBeInTheDocument();
    expect(screen.getByTestId('mock-text-input')).toBeInTheDocument();
  });

  it('does not render tooltip section when tooltipLabel is not provided', () => {
    render(<ColorsSettingsField {...baseProps} />);

    expect(screen.queryByText('Primary color label')).not.toBeInTheDocument();
    expect(screen.queryByTestId('svg-icon-mock')).not.toBeInTheDocument();
  });

  it('renders tooltip label text when tooltipLabel is provided', () => {
    render(<ColorsSettingsField {...baseProps} tooltipLabel="My tooltip label" />);

    expect(screen.getByText('My tooltip label')).toBeInTheDocument();
  });

  it('does not render tooltip icon when tooltipLabel is provided but tooltipText is not', () => {
    render(<ColorsSettingsField {...baseProps} tooltipLabel="My tooltip label" />);

    expect(screen.queryByTestId('svg-icon-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tooltip-label-tooltip')).not.toBeInTheDocument();
  });

  it('renders tooltip icon and Tooltip when both tooltipLabel and tooltipText are provided', () => {
    render(<ColorsSettingsField {...baseProps} tooltipLabel="My tooltip label" tooltipText="Tooltip description" />);

    expect(screen.getByTestId('svg-icon-mock')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-label-tooltip')).toBeInTheDocument();
  });

  it('calls onChange with (name, value) when ColorPicker changes', () => {
    render(<ColorsSettingsField {...baseProps} />);

    fireEvent.change(screen.getByTestId('mock-color-picker'), { target: { value: '#ff0000' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('primary-default', '#ff0000');
  });

  it('calls onChange with (name, value) when TextInput changes', () => {
    render(<ColorsSettingsField {...baseProps} />);

    fireEvent.change(screen.getByTestId('mock-text-input'), { target: { value: '#abcdef' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('primary-default', '#abcdef');
  });

  it('applies custom className to the wrapper', () => {
    render(<ColorsSettingsField {...baseProps} className="my-custom-class" />);

    expect(screen.getByTestId('sh-colors-settings-field')).toHaveClass('my-custom-class');
  });
});
