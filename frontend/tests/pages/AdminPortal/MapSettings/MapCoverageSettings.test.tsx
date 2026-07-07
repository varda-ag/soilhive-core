import { render, screen, fireEvent } from '@testing-library/react';
import { MapCoverageSettings } from 'pages/AdminPortal/MapSettings/MapCoverageSettings/MapCoverageSettings';

jest.mock('components/UI', () => ({
  ToggleButton: ({ checked, onChange }: any) => <button data-testid="toggle-button" data-checked={String(checked)} onClick={onChange} />,
  RadioButton: ({ name, value, isChecked, onChange }: any) => (
    <input
      type="radio"
      data-testid={`radio-${value}`}
      name={name}
      value={value}
      checked={isChecked}
      onChange={e => onChange(e.target.value)}
    />
  ),
}));

const defaultProps = {
  isDaiEnabled: false,
  defaultValue: false,
  onActivationChange: jest.fn(),
  onDefaultValueChange: jest.fn(),
};

describe('MapCoverageSettings', () => {
  afterEach(() => jest.clearAllMocks());

  describe('rendering', () => {
    it('renders the section title', () => {
      render(<MapCoverageSettings {...defaultProps} />);
      expect(screen.getByText('Coverage map')).toBeInTheDocument();
    });

    it('renders the section subtitle', () => {
      render(<MapCoverageSettings {...defaultProps} />);
      expect(screen.getByText('Display the dataset coverage layer on the public map.')).toBeInTheDocument();
    });

    it('renders the settings title', () => {
      render(<MapCoverageSettings {...defaultProps} />);
      expect(screen.getByText('Activate coverage map')).toBeInTheDocument();
    });

    it('renders the warning banner', () => {
      render(<MapCoverageSettings {...defaultProps} />);
      expect(screen.getByTestId('warning-icon')).toBeInTheDocument();
      expect(screen.getByText('Performance impact')).toBeInTheDocument();
    });
  });

  describe('ToggleButton', () => {
    it('reflects isDaiEnabled=false', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled={false} />);
      expect(screen.getByTestId('toggle-button')).toHaveAttribute('data-checked', 'false');
    });

    it('reflects isDaiEnabled=true', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled />);
      expect(screen.getByTestId('toggle-button')).toHaveAttribute('data-checked', 'true');
    });

    it('calls onActivationChange when toggled', () => {
      const onActivationChange = jest.fn();
      render(<MapCoverageSettings {...defaultProps} onActivationChange={onActivationChange} />);
      fireEvent.click(screen.getByTestId('toggle-button'));
      expect(onActivationChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('default value section', () => {
    it('is hidden when isDaiEnabled is false', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled={false} />);
      expect(screen.queryByTestId('radio-active')).not.toBeInTheDocument();
      expect(screen.queryByTestId('radio-inactive')).not.toBeInTheDocument();
    });

    it('is visible when isDaiEnabled is true', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled />);
      expect(screen.getByTestId('radio-active')).toBeInTheDocument();
      expect(screen.getByTestId('radio-inactive')).toBeInTheDocument();
    });

    it('renders the description texts', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled />);
      expect(screen.getByText('Display on the map')).toBeInTheDocument();
      expect(screen.getByText('Shown by default')).toBeInTheDocument();
      expect(screen.getByText('Hidden by default (user can enable)')).toBeInTheDocument();
    });

    it('checks "active" radio when defaultValue is true', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled defaultValue />);
      expect(screen.getByTestId('radio-active')).toBeChecked();
      expect(screen.getByTestId('radio-inactive')).not.toBeChecked();
    });

    it('checks "inactive" radio when defaultValue is false', () => {
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled defaultValue={false} />);
      expect(screen.getByTestId('radio-inactive')).toBeChecked();
      expect(screen.getByTestId('radio-active')).not.toBeChecked();
    });

    it('calls onDefaultValueChange with true when "active" radio is selected', () => {
      const onDefaultValueChange = jest.fn();
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled defaultValue={false} onDefaultValueChange={onDefaultValueChange} />);
      fireEvent.click(screen.getByTestId('radio-active'));
      expect(onDefaultValueChange).toHaveBeenCalledWith(true);
    });

    it('calls onDefaultValueChange with false when "inactive" radio is selected', () => {
      const onDefaultValueChange = jest.fn();
      render(<MapCoverageSettings {...defaultProps} isDaiEnabled defaultValue onDefaultValueChange={onDefaultValueChange} />);
      fireEvent.click(screen.getByTestId('radio-inactive'));
      expect(onDefaultValueChange).toHaveBeenCalledWith(false);
    });
  });
});
