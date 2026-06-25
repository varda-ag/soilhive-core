import { render, screen, fireEvent } from '@testing-library/react';
import { EditorRow } from 'components/Metadata/EditorRow/EditorRow';
import useNotifications from 'hooks/useNotifications';

jest.mock('primereact/editor', () => ({
  Editor: ({ value, onTextChange, placeholder }: any) => (
    <textarea
      data-testid="mock-editor"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e: any) => onTextChange({ htmlValue: e.target.value })}
    />
  ),
}));

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('configuration/editor', () => ({
  EDITOR_HEADER: null,
}));

const mockShowNotification = jest.fn();

const defaultProps = {
  label: 'Name',
  value: 'Test Value',
  isEditable: false,
  property: 'name',
  onStartEditing: jest.fn(),
  onSave: jest.fn(),
  onCancel: jest.fn(),
};

describe('EditorRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotifications as jest.Mock).mockReturnValue({ showNotification: mockShowNotification });
  });

  describe('display mode – text variant', () => {
    it('renders label and value', () => {
      render(<EditorRow {...defaultProps} variant="text" />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Test Value')).toBeInTheDocument();
    });

    it('does not show edit button when isEditable=false', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={false} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('shows edit button when isEditable=true', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} />);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('renders nothing for value when value is null', () => {
      render(<EditorRow {...defaultProps} variant="text" value={null} />);
      expect(screen.queryByText('Test Value')).not.toBeInTheDocument();
    });
  });

  describe('display mode – editor variant', () => {
    it('renders label and HTML value via htmlDisplay', () => {
      render(<EditorRow {...defaultProps} variant="editor" value="<p>Hello World</p>" />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('does not show edit button when isEditable=false', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={false} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });
  });

  describe('entering edit mode', () => {
    it('clicking Edit calls onStartEditing and shows text input (text variant)', () => {
      const onStartEditing = jest.fn();
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} onStartEditing={onStartEditing} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onStartEditing).toHaveBeenCalledWith('name');
      expect(screen.getByTestId('sh-ui-textinputfield')).toBeInTheDocument();
    });

    it('text input starts with current value', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} value="Initial" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('Initial');
    });

    it('clicking Edit calls onStartEditing and shows editor (editor variant)', () => {
      const onStartEditing = jest.fn();
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} onStartEditing={onStartEditing} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onStartEditing).toHaveBeenCalledWith('name');
      expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
    });
  });

  describe('save flow', () => {
    it('clicking Save calls onSave with property, new value, and callbacks', () => {
      const onSave = jest.fn();
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'New Value' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith(
        'name',
        'New Value',
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('onSuccess exits editing mode', () => {
      const onSave = jest.fn((_property: string, _value: string, { onSuccess }: any) => onSuccess());
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('onError shows notification and stays in editing mode', () => {
      const error = new Error('Server error');
      const onSave = jest.fn((_property: string, _value: string, { onError }: any) => onError(error));
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'Server error' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('shows "Saving…" and disables buttons while save is in flight', () => {
      const onSave = jest.fn(); // never calls callbacks — simulates pending request
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('Saving…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
  });

  describe('cancel flow', () => {
    it('clicking Cancel calls onCancel and exits editing mode', () => {
      const onCancel = jest.fn();
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} onCancel={onCancel} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onCancel).toHaveBeenCalledWith('name');
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('Cancel resets editValue to original prop value', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} value="Original" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'Changed' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-enter editing to confirm value was reset
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('Original');
    });
  });

  describe('displayPlaceholder prop', () => {
    it('shows displayPlaceholder in text variant when value is null', () => {
      render(<EditorRow {...defaultProps} variant="text" value={null} displayPlaceholder="No value yet" />);
      expect(screen.getByText('No value yet')).toBeInTheDocument();
    });

    it('shows displayPlaceholder in editor variant when value is null', () => {
      render(<EditorRow {...defaultProps} variant="editor" value={null} displayPlaceholder="No value yet" />);
      expect(screen.getByText('No value yet')).toBeInTheDocument();
    });

    it('does not show displayPlaceholder when value is present', () => {
      render(<EditorRow {...defaultProps} variant="text" value="Real Value" displayPlaceholder="No value yet" />);
      expect(screen.queryByText('No value yet')).not.toBeInTheDocument();
      expect(screen.getByText('Real Value')).toBeInTheDocument();
    });
  });

  describe('disableBackground prop', () => {
    it('applies RowNoBackground class when disableBackground is true', () => {
      const { container } = render(<EditorRow {...defaultProps} disableBackground={true} />);
      expect(container.firstChild).toHaveClass('RowNoBackground');
    });

    it('does not apply RowNoBackground class when disableBackground is not set', () => {
      const { container } = render(<EditorRow {...defaultProps} />);
      expect(container.firstChild).not.toHaveClass('RowNoBackground');
    });
  });

  describe('placeholder prop', () => {
    it('passes placeholder to TextInput in text variant edit mode', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} placeholder="Enter name…" />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveAttribute('placeholder', 'Enter name…');
    });

    it('passes placeholder to Editor in editor variant edit mode', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} placeholder="Enter description…" />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByTestId('mock-editor')).toHaveAttribute('placeholder', 'Enter description…');
    });
  });

  it('matches snapshot in display mode with edit button', () => {
    const { container } = render(<EditorRow {...defaultProps} variant="text" isEditable={true} />);
    expect(container).toMatchSnapshot();
  });

  describe('isRequired validation – text variant', () => {
    it('shows error and does not call onSave when field is cleared and Save is clicked', () => {
      const onSave = jest.fn();
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} isRequired onSave={onSave} value="Initial" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('This field is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('clears error and saves successfully after user fills the field', () => {
      const onSave = jest.fn((_property: string, _value: string, { onSuccess }: any) => onSuccess());
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} isRequired onSave={onSave} value="Initial" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('This field is required')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'New Value' } });
      expect(screen.queryByText('This field is required')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSave).toHaveBeenCalledWith('name', 'New Value', expect.any(Object));
    });
  });

  describe('isRequired validation – editor variant', () => {
    it('shows error message and does not call onSave when rich-text editor is empty', () => {
      const onSave = jest.fn();
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} isRequired onSave={onSave} value="" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('This field is required')).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('clears error when user types in the editor', () => {
      const onSave = jest.fn((_property: string, _value: string, { onSuccess }: any) => onSuccess());
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} isRequired onSave={onSave} value="" />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByText('This field is required')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: '<p>Content</p>' } });
      expect(screen.queryByText('This field is required')).not.toBeInTheDocument();
    });
  });
});
