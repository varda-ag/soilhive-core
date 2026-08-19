import { render, screen, fireEvent } from '@testing-library/react';
import { NumberRow } from 'components/Metadata/NumberRow/NumberRow';

const mockOnChange = jest.fn();

const defaultProps = {
  label: 'Min depth',
  value: 10 as number | null | undefined,
  isEditable: false,
  property: 'soil_depth_min',
  onChange: mockOnChange,
};

describe('NumberRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('view mode (isEditable=false)', () => {
    it('renders label and numeric value', () => {
      render(<NumberRow {...defaultProps} />);
      expect(screen.getByText('Min depth')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('renders empty when value is null', () => {
      render(<NumberRow {...defaultProps} value={null} />);
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });

    it('renders empty when value is undefined', () => {
      render(<NumberRow {...defaultProps} value={undefined} />);
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });

    it('renders an asterisk when isRequired', () => {
      const { container } = render(<NumberRow {...defaultProps} isRequired />);
      const label = container.querySelector('p > strong');
      expect(label?.textContent).toBe('Min depth*');
      expect(label?.querySelector('sup')).toHaveTextContent('*');
    });

    it('does not render an asterisk when isRequired is not set', () => {
      const { container } = render(<NumberRow {...defaultProps} />);
      expect(container.querySelector('p > strong sup')).not.toBeInTheDocument();
    });

    it('does not render an input in view mode', () => {
      render(<NumberRow {...defaultProps} />);
      expect(screen.queryByTestId('sh-ui-textinputfield')).not.toBeInTheDocument();
    });
  });

  describe('edit mode (isEditable=true)', () => {
    it('renders TextInput immediately without an Edit button', () => {
      render(<NumberRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('TextInput shows the numeric value', () => {
      render(<NumberRow {...defaultProps} isEditable={true} value={42} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue(42);
    });

    it('TextInput is empty when value is null', () => {
      render(<NumberRow {...defaultProps} isEditable={true} value={null} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue(null);
    });

    it('TextInput is empty when value is undefined', () => {
      render(<NumberRow {...defaultProps} isEditable={true} value={undefined} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue(null);
    });

    it('calls onChange with property and new string value on input change', () => {
      render(<NumberRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '25' } });
      expect(mockOnChange).toHaveBeenCalledWith('soil_depth_min', '25');
    });

    it('shows min–max placeholder when both min and max are defined', () => {
      render(<NumberRow {...defaultProps} isEditable={true} min={0} max={100} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveAttribute('placeholder', '0–100');
    });

    it('has no placeholder when min and max are omitted', () => {
      render(<NumberRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveAttribute('placeholder', '');
    });
  });
});
