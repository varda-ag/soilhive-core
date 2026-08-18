import { render, screen, fireEvent } from '@testing-library/react';
import { RelatedResourcesRow } from 'components/Metadata/RelatedResourcesRow/RelatedResourcesRow';

const mockOnChange = jest.fn();

const defaultProps = {
  label: 'Related Resources',
  value: null as string[] | null | undefined,
  isEditable: false,
  property: 'related_resources',
  onChange: mockOnChange,
};

describe('RelatedResourcesRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('view mode (isEditable=false)', () => {
    it('renders the label', () => {
      render(<RelatedResourcesRow {...defaultProps} />);
      expect(screen.getByText('Related Resources')).toBeInTheDocument();
    });

    it('renders each URL as a clickable link with correct href and matches the snapshot', () => {
      const { container } = render(<RelatedResourcesRow {...defaultProps} value={['https://example.com', 'https://soil.org']} />);
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', 'https://example.com');
      expect(links[1]).toHaveAttribute('href', 'https://soil.org');
      expect(container).toMatchSnapshot();
    });

    it('renders a "Link" badge for each item', () => {
      render(<RelatedResourcesRow {...defaultProps} value={['https://example.com', 'https://soil.org']} />);
      expect(screen.getAllByText('Link')).toHaveLength(2);
    });

    it('does not render Remove buttons in view mode', () => {
      render(<RelatedResourcesRow {...defaultProps} value={['https://example.com']} />);
      expect(screen.queryByRole('button', { name: 'Remove resource' })).not.toBeInTheDocument();
    });

    it('shows displayPlaceholder when value is null', () => {
      render(<RelatedResourcesRow {...defaultProps} value={null} displayPlaceholder="-" />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('shows displayPlaceholder when value is an empty array', () => {
      render(<RelatedResourcesRow {...defaultProps} value={[]} displayPlaceholder="-" />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('does not show displayPlaceholder when value has items', () => {
      render(<RelatedResourcesRow {...defaultProps} value={['https://example.com']} displayPlaceholder="-" />);
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    });
  });

  describe('edit mode (isEditable=true)', () => {
    it('shows the edit UI immediately without requiring an Edit button', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('URL input starts empty', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('');
    });

    it('existing URLs are shown with Remove buttons', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://existing.com']} />);
      expect(screen.getByText('https://existing.com')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove resource' })).toBeInTheDocument();
    });

    it('Add button is disabled when input is empty', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('Add button is disabled for whitespace-only input', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '   ' } });
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('Add button is disabled for an invalid URL', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'not-a-url' } });
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('Add button is disabled for a non-http/https URL', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'ftp://example.com' } });
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('Add button is enabled for a valid https URL', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled();
    });

    it('clicking Add calls onChange with the new URL appended to existing value', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://existing.com']} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(mockOnChange).toHaveBeenCalledWith('related_resources', ['https://existing.com', 'https://new.com']);
    });

    it('clicking Add when value is null calls onChange with a single-item array', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={null} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(mockOnChange).toHaveBeenCalledWith('related_resources', ['https://new.com']);
    });

    it('trims whitespace from the URL before adding', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={null} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '  https://new.com  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(mockOnChange).toHaveBeenCalledWith('related_resources', ['https://new.com']);
    });

    it('clears the input after a successful add', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('');
    });

    it('form submit also triggers add', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={null} />);
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://enter.com' } });
      fireEvent.submit(screen.getByTestId('sh-ui-textinputfield').closest('form')!);
      expect(mockOnChange).toHaveBeenCalledWith('related_resources', ['https://enter.com']);
    });

    it('clicking Remove calls onChange with that URL excluded', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://a.com', 'https://b.com']} />);
      const removeButtons = screen.getAllByRole('button', { name: 'Remove resource' });
      fireEvent.click(removeButtons[0]);
      expect(mockOnChange).toHaveBeenCalledWith('related_resources', ['https://b.com']);
    });

    it('removing the last item calls onChange with an empty array', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://only.com']} />);
      fireEvent.click(screen.getByRole('button', { name: 'Remove resource' }));
      expect(mockOnChange).toHaveBeenCalledWith('related_resources', []);
    });
  });

  describe('displayPlaceholder prop', () => {
    it('shows placeholder when value is null', () => {
      render(<RelatedResourcesRow {...defaultProps} value={null} displayPlaceholder="No links yet" />);
      expect(screen.getByText('No links yet')).toBeInTheDocument();
    });

    it('shows placeholder when value is an empty array', () => {
      render(<RelatedResourcesRow {...defaultProps} value={[]} displayPlaceholder="No links yet" />);
      expect(screen.getByText('No links yet')).toBeInTheDocument();
    });

    it('does not show placeholder when value has items', () => {
      render(<RelatedResourcesRow {...defaultProps} value={['https://example.com']} displayPlaceholder="No links yet" />);
      expect(screen.queryByText('No links yet')).not.toBeInTheDocument();
    });
  });

  describe('disableBackground prop', () => {
    it('applies RowNoBackground class when disableBackground=true', () => {
      const { container } = render(<RelatedResourcesRow {...defaultProps} disableBackground={true} />);
      expect(container.firstChild).toHaveClass('RowNoBackground');
    });

    it('does not apply RowNoBackground class when prop is omitted', () => {
      const { container } = render(<RelatedResourcesRow {...defaultProps} />);
      expect(container.firstChild).not.toHaveClass('RowNoBackground');
    });
  });
});
