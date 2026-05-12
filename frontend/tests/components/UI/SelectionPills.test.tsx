import { fireEvent, render, screen } from '@testing-library/react';
import { SelectionPills } from 'components/UI/SelectionPills/SelectionPills';

describe('SelectionPills', () => {
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when selections empty', () => {
    const { container } = render(<SelectionPills selections={[]} onRemove={mockOnRemove} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders pills with correct labels', () => {
    const selections = [
      { id: '1', label: 'First' },
      { id: '2', label: 'Second' },
    ];
    render(<SelectionPills selections={selections} onRemove={mockOnRemove} />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('calls onRemove with correct ID when X clicked', () => {
    const selections = [{ id: '1', label: 'Test' }];
    render(<SelectionPills selections={selections} onRemove={mockOnRemove} />);

    const removeButton = screen.getByLabelText('Remove Test');
    fireEvent.click(removeButton);

    expect(mockOnRemove).toHaveBeenCalledWith('1');
    expect(mockOnRemove).toHaveBeenCalledTimes(1);
  });

  it('renders disabled pills if disabled is true in the selection', () => {
    const selections = [{ id: '1', label: 'Test', disabled: true }];
    const { container } = render(<SelectionPills selections={selections} onRemove={mockOnRemove} />);

    expect(container.querySelector('.Pill.Disabled')).toBeInTheDocument();
  });
});
