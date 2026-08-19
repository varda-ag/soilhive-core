import { render, screen, fireEvent } from '@testing-library/react';
import { PublicationDateRow } from 'components/Metadata/PublicationDateRow/PublicationDateRow';

jest.mock('primereact/calendar', () => ({
  Calendar: ({ value, onChange, placeholder }: any) => {
    const formatted = value
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : '';
    return (
      <input
        data-testid="mock-calendar"
        defaultValue={formatted}
        placeholder={placeholder}
        onChange={e => {
          const v = e.target.value;
          if (!v) {
            onChange({ value: null });
          } else {
            const [y, m, d] = v.split('-').map(Number);
            onChange({ value: new Date(y, m - 1, d) });
          }
        }}
      />
    );
  },
}));

const mockOnChange = jest.fn();

const defaultProps = {
  label: 'Publication Date',
  value: null as string | null | undefined,
  isEditable: false,
  property: 'publication_date',
  onChange: mockOnChange,
};

describe('PublicationDateRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('view mode (isEditable=false)', () => {
    it('renders the label', () => {
      render(<PublicationDateRow {...defaultProps} />);
      expect(screen.getByText('Publication Date')).toBeInTheDocument();
    });

    it('renders the date value as text', () => {
      render(<PublicationDateRow {...defaultProps} value="2024-03-15" />);
      expect(screen.getByText('2024-03-15')).toBeInTheDocument();
    });

    it('renders empty when value is null', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} value={null} />);
      expect(container.querySelector('.Text')?.textContent).toBe('');
    });

    it('renders empty when value is undefined', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} value={undefined} />);
      expect(container.querySelector('.Text')?.textContent).toBe('');
    });

    it('renders asterisk when isRequired', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} isRequired />);
      expect(container.querySelector('sup')).toHaveTextContent('*');
    });

    it('does not render asterisk when isRequired is not set', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} />);
      expect(container.querySelector('sup')).not.toBeInTheDocument();
    });

    it('does not render Calendar in view mode', () => {
      render(<PublicationDateRow {...defaultProps} />);
      expect(screen.queryByTestId('mock-calendar')).not.toBeInTheDocument();
    });
  });

  describe('edit mode (isEditable=true)', () => {
    it('renders Calendar', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('mock-calendar')).toBeInTheDocument();
    });

    it('Calendar has YYYY-MM-DD placeholder', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    });

    it('Calendar is empty when value is null', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} value={null} />);
      expect(screen.getByTestId('mock-calendar')).toHaveValue('');
    });

    it('Calendar is empty when value is undefined', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} value={undefined} />);
      expect(screen.getByTestId('mock-calendar')).toHaveValue('');
    });

    it('Calendar displays the parsed date from value prop', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      expect(screen.getByTestId('mock-calendar')).toHaveValue('2024-03-15');
    });

    it('calls onChange with YYYY-MM-DD string when a date is selected', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('mock-calendar'), { target: { value: '2024-06-20' } });
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2024-06-20');
    });

    it('calls onChange with empty string when date is cleared', () => {
      render(<PublicationDateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      fireEvent.change(screen.getByTestId('mock-calendar'), { target: { value: '' } });
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '');
    });

    it('applies CalendarWrapperError class when hasError is true', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} isEditable={true} hasError={true} />);
      expect(container.querySelector('.CalendarWrapperError')).toBeInTheDocument();
    });

    it('does not apply CalendarWrapperError class when hasError is false', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} isEditable={true} hasError={false} />);
      expect(container.querySelector('.CalendarWrapperError')).not.toBeInTheDocument();
    });

    it('does not apply CalendarWrapperError class when hasError is not set', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} isEditable={true} />);
      expect(container.querySelector('.CalendarWrapperError')).not.toBeInTheDocument();
    });

    it('renders asterisk when isRequired in edit mode', () => {
      const { container } = render(<PublicationDateRow {...defaultProps} isEditable={true} isRequired />);
      expect(container.querySelector('sup')).toHaveTextContent('*');
    });
  });
});
