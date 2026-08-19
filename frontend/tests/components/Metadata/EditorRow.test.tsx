import { render, screen, fireEvent } from '@testing-library/react';
import { EditorRow } from 'components/Metadata/EditorRow/EditorRow';

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

jest.mock('configuration/editor', () => ({
  EDITOR_HEADER: null,
}));

const mockOnChange = jest.fn();

const defaultProps = {
  label: 'Name',
  value: 'Test Value',
  isEditable: false,
  property: 'name',
  onChange: mockOnChange,
};

describe('EditorRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('view mode (isEditable=false)', () => {
    it('renders label and value in text variant', () => {
      const { container } = render(<EditorRow {...defaultProps} variant="text" />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Test Value')).toBeInTheDocument();
      expect(container).toMatchSnapshot();
    });

    it('renders label and HTML value in editor variant', () => {
      render(<EditorRow {...defaultProps} variant="editor" value="<p>Hello World</p>" />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

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

    it('does not render any input in view mode', () => {
      render(<EditorRow {...defaultProps} variant="text" />);
      expect(screen.queryByTestId('sh-ui-textinputfield')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-editor')).not.toBeInTheDocument();
    });
  });

  describe('edit mode - text variant', () => {
    it('renders TextInput with the current value', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('Test Value');
    });

    it('renders TextInput with empty string when value is null', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} value={null} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('');
    });

    it('calls onChange with property and new value on input change', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'New Value' } });
      expect(mockOnChange).toHaveBeenCalledWith('name', 'New Value');
    });

    it('passes placeholder to TextInput', () => {
      render(<EditorRow {...defaultProps} variant="text" isEditable={true} placeholder="Enter name…" />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveAttribute('placeholder', 'Enter name…');
    });
  });

  describe('edit mode - editor variant', () => {
    it('renders Editor with the current value', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} />);
      expect(screen.getByTestId('mock-editor')).toHaveValue('Test Value');
    });

    it('renders Editor with empty string when value is null', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} value={null} />);
      expect(screen.getByTestId('mock-editor')).toHaveValue('');
    });

    it('calls onChange with property and htmlValue on editor change', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} />);
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: '<p>New content</p>' } });
      expect(mockOnChange).toHaveBeenCalledWith('name', '<p>New content</p>');
    });

    it('calls onChange with empty string when editor is cleared', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} />);
      fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: '' } });
      expect(mockOnChange).toHaveBeenCalledWith('name', '');
    });

    it('passes placeholder to Editor', () => {
      render(<EditorRow {...defaultProps} variant="editor" isEditable={true} placeholder="Enter description…" />);
      expect(screen.getByTestId('mock-editor')).toHaveAttribute('placeholder', 'Enter description…');
    });

    it('adds EditorWrapperError class when hasError is true', () => {
      const { container } = render(<EditorRow {...defaultProps} variant="editor" isEditable={true} hasError={true} />);
      expect(container.querySelector('.EditorWrapperError')).toBeInTheDocument();
    });

    it('does not add EditorWrapperError class when hasError is false', () => {
      const { container } = render(<EditorRow {...defaultProps} variant="editor" isEditable={true} hasError={false} />);
      expect(container.querySelector('.EditorWrapperError')).not.toBeInTheDocument();
    });
  });

  describe('isRequired prop', () => {
    it('renders an asterisk next to the label when isRequired', () => {
      const { container } = render(<EditorRow {...defaultProps} isRequired />);
      const label = container.querySelector('p > strong');
      expect(label?.textContent).toBe('Name*');
      expect(label?.querySelector('sup')).toHaveTextContent('*');
    });

    it('does not render an asterisk when isRequired is not set', () => {
      const { container } = render(<EditorRow {...defaultProps} />);
      expect(container.querySelector('p > strong sup')).not.toBeInTheDocument();
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
});
