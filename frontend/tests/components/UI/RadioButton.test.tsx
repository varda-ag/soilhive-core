import { render, screen, fireEvent } from '@testing-library/react';
import { RadioButton } from 'components/UI/RadioButton/RadioButton';

const defaultProps = {
  name: 'group',
  value: 'option-a',
  onChange: jest.fn(),
};

describe('RadioButton', () => {
  afterEach(() => jest.clearAllMocks());

  describe('rendering', () => {
    it('renders the radio input', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    it('has the sh-ui-radiobutton test id', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toBeInTheDocument();
    });

    it('renders a label when provided', () => {
      render(<RadioButton {...defaultProps} label="My option" />);
      expect(screen.getByText('My option')).toBeInTheDocument();
    });

    it('renders no label element when label is omitted', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
    });

    it('sets the correct name attribute', () => {
      render(<RadioButton {...defaultProps} name="my-group" />);
      expect(screen.getByRole('radio')).toHaveAttribute('name', 'my-group');
    });

    it('sets the correct value attribute', () => {
      render(<RadioButton {...defaultProps} value="option-b" />);
      expect(screen.getByRole('radio')).toHaveAttribute('value', 'option-b');
    });

    it('applies a custom className', () => {
      render(<RadioButton {...defaultProps} className="custom" />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('custom');
    });
  });

  describe('isChecked', () => {
    it('is unchecked by default', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.getByRole('radio')).not.toBeChecked();
    });

    it('is checked when isChecked is true', () => {
      render(<RadioButton {...defaultProps} isChecked />);
      expect(screen.getByRole('radio')).toBeChecked();
    });

    it('applies the Checked class when isChecked is true', () => {
      render(<RadioButton {...defaultProps} isChecked />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('Checked');
    });

    it('does not apply the Checked class when isChecked is false', () => {
      render(<RadioButton {...defaultProps} isChecked={false} />);
      expect(screen.getByTestId('sh-ui-radiobutton')).not.toHaveClass('Checked');
    });
  });

  describe('isDisabled', () => {
    it('is not disabled by default', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.getByRole('radio')).not.toBeDisabled();
    });

    it('disables the input when isDisabled is true', () => {
      render(<RadioButton {...defaultProps} isDisabled />);
      expect(screen.getByRole('radio')).toBeDisabled();
    });

    it('applies the Disabled class when isDisabled is true', () => {
      render(<RadioButton {...defaultProps} isDisabled />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('Disabled');
    });
  });

  describe('isError', () => {
    it('does not apply the Error class by default', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.getByTestId('sh-ui-radiobutton')).not.toHaveClass('Error');
    });

    it('applies the Error class when isError is true', () => {
      render(<RadioButton {...defaultProps} isError />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('Error');
    });
  });

  describe('size', () => {
    it('applies the Medium class by default', () => {
      render(<RadioButton {...defaultProps} />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('Medium');
    });

    it('applies the Small class when size is small', () => {
      render(<RadioButton {...defaultProps} size="small" />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('Small');
    });

    it('applies the Tiny class when size is tiny', () => {
      render(<RadioButton {...defaultProps} size="tiny" />);
      expect(screen.getByTestId('sh-ui-radiobutton')).toHaveClass('Tiny');
    });
  });

  describe('onChange', () => {
    it('calls onChange with value and name when changed', () => {
      const onChange = jest.fn();
      render(<RadioButton {...defaultProps} name="my-group" value="option-b" onChange={onChange} />);
      fireEvent.click(screen.getByRole('radio'));
      expect(onChange).toHaveBeenCalledWith('option-b', 'my-group');
    });
  });
});
