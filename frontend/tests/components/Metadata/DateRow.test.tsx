import { render, screen, fireEvent } from '@testing-library/react';
import { DateRow } from 'components/Metadata/DateRow/DateRow';

jest.mock('primereact/calendar', () => ({
  Calendar: ({ value, onChange, placeholder, view }: any) => {
    const formatted = value
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : '';
    return (
      <input
        data-testid="mock-calendar"
        data-view={view}
        defaultValue={formatted}
        placeholder={placeholder}
        onChange={e => {
          const v = e.target.value;
          if (!v) {
            onChange({ value: null });
          } else {
            const [y, m, d] = v.split('-').map(Number);
            onChange({ value: new Date(y, (m || 1) - 1, d || 1) });
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

describe('DateRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('view mode (isEditable=false)', () => {
    it('renders the label', () => {
      render(<DateRow {...defaultProps} />);
      expect(screen.getByText('Publication Date')).toBeInTheDocument();
    });

    it('renders the date value as text', () => {
      render(<DateRow {...defaultProps} value="2024-03-15" />);
      expect(screen.getByText('2024-03-15')).toBeInTheDocument();
    });

    it('renders empty when value is null', () => {
      const { container } = render(<DateRow {...defaultProps} value={null} />);
      expect(container.querySelector('.Text')?.textContent).toBe('');
    });

    it('renders empty when value is undefined', () => {
      const { container } = render(<DateRow {...defaultProps} value={undefined} />);
      expect(container.querySelector('.Text')?.textContent).toBe('');
    });

    it('renders asterisk when isRequired', () => {
      const { container } = render(<DateRow {...defaultProps} isRequired />);
      expect(container.querySelector('sup')).toHaveTextContent('*');
    });

    it('does not render asterisk when isRequired is not set', () => {
      const { container } = render(<DateRow {...defaultProps} />);
      expect(container.querySelector('sup')).not.toBeInTheDocument();
    });

    it('does not render Calendar in view mode', () => {
      render(<DateRow {...defaultProps} />);
      expect(screen.queryByTestId('mock-calendar')).not.toBeInTheDocument();
    });
  });

  describe('edit mode (isEditable=true)', () => {
    it('renders Calendar', () => {
      render(<DateRow {...defaultProps} isEditable={true} />);
      expect(screen.getByTestId('mock-calendar')).toBeInTheDocument();
    });

    it('Calendar is empty when value is null', () => {
      render(<DateRow {...defaultProps} isEditable={true} value={null} />);
      expect(screen.getByTestId('mock-calendar')).toHaveValue('');
    });

    it('Calendar is empty when value is undefined', () => {
      render(<DateRow {...defaultProps} isEditable={true} value={undefined} />);
      expect(screen.getByTestId('mock-calendar')).toHaveValue('');
    });

    it('Calendar displays the parsed date from value prop', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      expect(screen.getByTestId('mock-calendar')).toHaveValue('2024-03-15');
    });

    it('calls onChange with YYYY-MM-DD string when a date is selected', () => {
      render(<DateRow {...defaultProps} isEditable={true} />);
      fireEvent.change(screen.getByTestId('mock-calendar'), { target: { value: '2024-06-20' } });
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2024-06-20');
    });

    it('calls onChange with empty string when date is cleared', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      fireEvent.change(screen.getByTestId('mock-calendar'), { target: { value: '' } });
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '');
    });

    it('applies CalendarWrapperError class when hasError is true', () => {
      const { container } = render(<DateRow {...defaultProps} isEditable={true} hasError={true} />);
      expect(container.querySelector('.CalendarWrapperError')).toBeInTheDocument();
    });

    it('does not apply CalendarWrapperError class when hasError is false', () => {
      const { container } = render(<DateRow {...defaultProps} isEditable={true} hasError={false} />);
      expect(container.querySelector('.CalendarWrapperError')).not.toBeInTheDocument();
    });

    it('does not apply CalendarWrapperError class when hasError is not set', () => {
      const { container } = render(<DateRow {...defaultProps} isEditable={true} />);
      expect(container.querySelector('.CalendarWrapperError')).not.toBeInTheDocument();
    });

    it('renders asterisk when isRequired in edit mode', () => {
      const { container } = render(<DateRow {...defaultProps} isEditable={true} isRequired />);
      expect(container.querySelector('sup')).toHaveTextContent('*');
    });

    it('renders granularity toggle buttons', () => {
      render(<DateRow {...defaultProps} isEditable={true} />);
      expect(screen.getByRole('button', { name: 'Year' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Year-Month' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Full date' })).toBeInTheDocument();
    });
  });

  describe('granularity detection from value', () => {
    it('defaults to date view when value is null', () => {
      render(<DateRow {...defaultProps} isEditable={true} value={null} />);
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'date');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    });

    it('uses year view when value is YYYY', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024" />);
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'year');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY');
    });

    it('uses month view when value is YYYY-MM', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03" />);
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'month');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY-MM');
    });

    it('uses date view when value is YYYY-MM-DD', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'date');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    });
  });

  describe('granularity toggle', () => {
    it('switches to year view and updates placeholder when Year is clicked', () => {
      render(<DateRow {...defaultProps} isEditable={true} />);
      fireEvent.click(screen.getByRole('button', { name: 'Year' }));
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'year');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY');
    });

    it('switches to month view and updates placeholder when Year-Month is clicked', () => {
      render(<DateRow {...defaultProps} isEditable={true} />);
      fireEvent.click(screen.getByRole('button', { name: 'Year-Month' }));
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'month');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY-MM');
    });

    it('switches to date view and updates placeholder when Full date is clicked', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024" />);
      fireEvent.click(screen.getByRole('button', { name: 'Full date' }));
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('data-view', 'date');
      expect(screen.getByTestId('mock-calendar')).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    });

    it('reformats existing value when switching from full date to year', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      fireEvent.click(screen.getByRole('button', { name: 'Year' }));
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2024');
    });

    it('reformats existing value when switching from full date to year-month', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03-15" />);
      fireEvent.click(screen.getByRole('button', { name: 'Year-Month' }));
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2024-03');
    });

    it('reformats existing value when switching from year-month to year', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03" />);
      fireEvent.click(screen.getByRole('button', { name: 'Year' }));
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2024');
    });

    it('does not call onChange when switching granularity with no value', () => {
      render(<DateRow {...defaultProps} isEditable={true} value={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Year' }));
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('calls onChange with year-only string when date selected in year view', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024" />);
      fireEvent.change(screen.getByTestId('mock-calendar'), { target: { value: '2025-01-01' } });
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2025');
    });

    it('calls onChange with YYYY-MM string when date selected in month view', () => {
      render(<DateRow {...defaultProps} isEditable={true} value="2024-03" />);
      fireEvent.change(screen.getByTestId('mock-calendar'), { target: { value: '2025-06-01' } });
      expect(mockOnChange).toHaveBeenCalledWith('publication_date', '2025-06');
    });
  });
});
