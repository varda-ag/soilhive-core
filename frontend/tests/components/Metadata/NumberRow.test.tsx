import { render, screen, fireEvent } from '@testing-library/react';
import { NumberRow } from 'components/Metadata/NumberRow/NumberRow';
import useNotifications from 'hooks/useNotifications';

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockShowNotification = jest.fn();

const defaultProps = {
  label: 'Min depth',
  value: 10,
  isEditable: false,
  property: 'soil_depth_min',
  onStartEditing: jest.fn(),
  onSave: jest.fn(),
  onCancel: jest.fn(),
};

describe('NumberRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotifications as jest.Mock).mockReturnValue({ showNotification: mockShowNotification });
  });

  describe('display mode', () => {
    it('renders an asterisk next to the label when isRequired', () => {
      const { container } = render(<NumberRow {...defaultProps} isRequired />);
      const label = container.querySelector('p > strong');
      expect(label?.textContent).toBe('Min depth*');
      expect(label?.querySelector('sup')).toHaveTextContent('*');
    });

    it('does not render an asterisk when isRequired is not set', () => {
      const { container } = render(<NumberRow {...defaultProps} />);
      expect(container.querySelector('p > strong sup')).not.toBeInTheDocument();
    });

    it('renders label and numeric value', () => {
      render(<NumberRow {...defaultProps} />);
      expect(screen.getByText('Min depth')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('renders empty when value is null', () => {
      render(<NumberRow {...defaultProps} value={null} />);
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });

    it('does not show edit button when isEditable=false', () => {
      render(<NumberRow {...defaultProps} isEditable={false} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('shows edit button when isEditable=true', () => {
      render(<NumberRow {...defaultProps} isEditable={true} />);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  describe('entering edit mode', () => {
    it('clicking Edit calls onStartEditing and shows number input', () => {
      const onStartEditing = jest.fn();
      render(<NumberRow {...defaultProps} isEditable={true} onStartEditing={onStartEditing} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onStartEditing).toHaveBeenCalledWith('soil_depth_min');
      expect(screen.getByTestId('sh-ui-textinputfield')).toBeInTheDocument();
    });

    it('number input starts with current value', () => {
      render(<NumberRow {...defaultProps} isEditable={true} value={42} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue(42);
    });

    it('shows min–max placeholder when both min and max are defined', () => {
      render(<NumberRow {...defaultProps} isEditable={true} min={0} max={100} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByPlaceholderText('0–100')).toBeInTheDocument();
    });

    it('shows empty placeholder when min or max are omitted', () => {
      render(<NumberRow {...defaultProps} isEditable={true} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      // TextInput defaults placeholder to '' when undefined is passed
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveAttribute('placeholder', '');
    });
  });

  describe('save flow', () => {
    it('clicking Save calls onSave with property, string value, and callbacks', () => {
      const onSave = jest.fn();
      render(<NumberRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '25' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith(
        'soil_depth_min',
        '25',
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('onSuccess exits editing mode', () => {
      const onSave = jest.fn((_property: string, _value: string, { onSuccess }: any) => onSuccess());
      render(<NumberRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('onError shows notification and stays in editing mode', () => {
      const error = new Error('Save failed');
      const onSave = jest.fn((_property: string, _value: string, { onError }: any) => onError(error));
      render(<NumberRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'Save failed' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('shows "Saving…" and disables Cancel while save is in flight', () => {
      const onSave = jest.fn(); // never calls callbacks — simulates pending request
      render(<NumberRow {...defaultProps} isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('Saving…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
  });

  describe('isRequired', () => {
    it('disables Save when field is empty', () => {
      render(<NumberRow {...defaultProps} isEditable={true} isRequired value={10} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '' } });

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('enables Save when field has a value', () => {
      render(<NumberRow {...defaultProps} isEditable={true} isRequired value={undefined} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '25' } });

      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });
  });

  describe('cancel flow', () => {
    it('clicking Cancel calls onCancel and exits editing mode', () => {
      const onCancel = jest.fn();
      render(<NumberRow {...defaultProps} isEditable={true} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onCancel).toHaveBeenCalledWith('soil_depth_min');
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('Cancel resets editValue to original prop value', () => {
      render(<NumberRow {...defaultProps} isEditable={true} value={10} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '99' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-enter editing to confirm value was reset
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue(10);
    });
  });
});
