import { render, screen, fireEvent } from '@testing-library/react';
import { RelatedResourcesRow } from 'components/Metadata/RelatedResourcesRow/RelatedResourcesRow';
import useNotifications from 'hooks/useNotifications';

jest.mock('hooks/useNotifications', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockShowNotification = jest.fn();

const defaultProps = {
  label: 'Related Resources',
  value: null as string[] | null,
  isEditable: false,
  property: 'related_resources',
  onStartEditing: jest.fn(),
  onSave: jest.fn(),
  onCancel: jest.fn(),
};

describe('RelatedResourcesRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotifications as jest.Mock).mockReturnValue({ showNotification: mockShowNotification });
  });

  describe('display mode – no resources', () => {
    it('renders the label', () => {
      render(<RelatedResourcesRow {...defaultProps} />);
      expect(screen.getByText('Related Resources')).toBeInTheDocument();
    });

    it('shows displayPlaceholder when value is null', () => {
      render(<RelatedResourcesRow {...defaultProps} value={null} displayPlaceholder="-" />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('shows displayPlaceholder when value is an empty array', () => {
      render(<RelatedResourcesRow {...defaultProps} value={[]} displayPlaceholder="-" />);
      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('does not show edit button when isEditable=false', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={false} />);
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('shows edit button when isEditable=true', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  describe('display mode – with resources', () => {
    const urls = ['https://example.com', 'https://soil.org'];

    it('renders each URL as a clickable link', () => {
      render(<RelatedResourcesRow {...defaultProps} value={urls} />);
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', 'https://example.com');
      expect(links[1]).toHaveAttribute('href', 'https://soil.org');
    });

    it('renders "Link" badge for each item', () => {
      render(<RelatedResourcesRow {...defaultProps} value={urls} />);
      expect(screen.getAllByText('Link')).toHaveLength(2);
    });

    it('does not show remove buttons in view mode', () => {
      render(<RelatedResourcesRow {...defaultProps} value={urls} />);
      expect(screen.queryByRole('button', { name: 'Remove resource' })).not.toBeInTheDocument();
    });

    it('does not show displayPlaceholder when value has items', () => {
      render(<RelatedResourcesRow {...defaultProps} value={urls} displayPlaceholder="-" />);
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    });
  });

  describe('entering edit mode', () => {
    it('clicking Edit calls onStartEditing and shows the edit UI', () => {
      const onStartEditing = jest.fn();
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} onStartEditing={onStartEditing} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(onStartEditing).toHaveBeenCalledWith('related_resources');
      expect(screen.getByTestId('sh-ui-textinputfield')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('the URL input starts empty', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('');
    });

    it('existing URLs appear in the added resources list on enter', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://existing.com']} />);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByText('https://existing.com')).toBeInTheDocument();
    });
  });

  describe('adding resources in edit mode', () => {
    const enterEditMode = () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    };

    it('typing a URL and clicking Add adds it to the list', () => {
      enterEditMode();

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('https://new.com')).toBeInTheDocument();
    });

    it('pressing Enter (form submit) also adds the URL', () => {
      enterEditMode();

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://enter.com' } });
      fireEvent.submit(screen.getByTestId('sh-ui-textinputfield').closest('form')!);

      expect(screen.getByText('https://enter.com')).toBeInTheDocument();
    });

    it('whitespace-only input does not add a resource', () => {
      enterEditMode();

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.queryByRole('button', { name: 'Remove resource' })).not.toBeInTheDocument();
    });

    it('Add button is disabled when the input is empty', () => {
      enterEditMode();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('the input field clears after a successful add', () => {
      enterEditMode();

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('');
    });
  });

  describe('removing resources in edit mode', () => {
    it('clicking Remove removes the URL from the edit list', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://to-remove.com']} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      fireEvent.click(screen.getByRole('button', { name: 'Remove resource' }));

      expect(screen.queryByText('https://to-remove.com')).not.toBeInTheDocument();
    });
  });

  describe('save button dirty state', () => {
    it('is disabled when no changes have been made (empty initial value)', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={[]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('is disabled when no changes have been made (non-empty initial value)', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://existing.com']} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('is enabled after adding a URL', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={[]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });

    it('is disabled again after removing a newly-added URL (back to original)', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={[]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove resource' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('is enabled after removing an existing saved URL', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://existing.com']} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Remove resource' }));
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });
  });

  describe('save flow', () => {
    it('clicking Save calls onSave with property, current editValues, and callbacks', () => {
      const onSave = jest.fn();
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={[]} onSave={onSave} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://a.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith(
        'related_resources',
        ['https://a.com'],
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('onSuccess exits editing mode', () => {
      const onSave = jest.fn((_prop: string, _val: string[], { onSuccess }: any) => onSuccess());
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} onSave={onSave} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('onError shows a notification and stays in edit mode', () => {
      const error = new Error('Server error');
      const onSave = jest.fn((_prop: string, _val: string[], { onError }: any) => onError(error));
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} onSave={onSave} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'Server error' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('shows "Saving…" and disables buttons while save is in flight', () => {
      const onSave = jest.fn(); // never calls callbacks — simulates pending request
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} onSave={onSave} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://new.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByText('Saving…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
  });

  describe('cancel flow', () => {
    it('clicking Cancel calls onCancel and exits editing mode', () => {
      const onCancel = jest.fn();
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} onCancel={onCancel} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onCancel).toHaveBeenCalledWith('related_resources');
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    it('unsaved added items are discarded on cancel', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={[]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://unsaved.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-enter edit mode to confirm value was reset
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.queryByText('https://unsaved.com')).not.toBeInTheDocument();
    });

    it('the URL input is cleared on cancel', () => {
      render(<RelatedResourcesRow {...defaultProps} isEditable={true} value={[]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      fireEvent.change(screen.getByTestId('sh-ui-textinputfield'), { target: { value: 'https://typed.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Re-enter edit mode to confirm input was cleared
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByTestId('sh-ui-textinputfield')).toHaveValue('');
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

  it('matches snapshot in display mode with isEditable=true and a value', () => {
    const { container } = render(
      <RelatedResourcesRow {...defaultProps} isEditable={true} value={['https://example.com', 'https://soil.org']} />,
    );
    expect(container).toMatchSnapshot();
  });
});
