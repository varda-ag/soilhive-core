import { fireEvent, render, screen } from '@testing-library/react';
import { TextArea } from 'components/UI/TextArea/TextArea';

jest.mock('components/UI', () => ({
  FormFieldWrapper: ({ children, ...rest }: any) => (
    <div data-testid="mock-wrapper" {...rest}>
      {children}
    </div>
  ),
}));

describe('TextArea component', () => {
  it('renders textarea field', () => {
    render(<TextArea />);
    expect(screen.getByTestId('sh-ui-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-textareafield')).toBeInTheDocument();

    render(<TextArea showCounter maxLength={100} />);
    expect(screen.getByTestId('sh-ui-textarea-counter')).toBeInTheDocument();
  });

  it('calls onChange when user types', () => {
    const handleChange = jest.fn();

    render(<TextArea name="email" onChange={handleChange} />);

    const textarea = screen.getByTestId('sh-ui-textareafield');

    fireEvent.change(textarea, { target: { value: 'aaa' } });

    expect(handleChange).toHaveBeenCalledWith('aaa', 'email');
  });

  it('calls onFocus when input is focused', () => {
    const handleFocus = jest.fn();

    render(<TextArea onFocus={handleFocus} />);

    const textarea = screen.getByTestId('sh-ui-textareafield');
    fireEvent.focus(textarea);

    expect(handleFocus).toHaveBeenCalled();
  });

  it('calls onBlur when input loses focus', () => {
    const handleBlur = jest.fn();

    render(<TextArea onBlur={handleBlur} />);

    const textarea = screen.getByTestId('sh-ui-textareafield');
    fireEvent.blur(textarea);

    expect(handleBlur).toHaveBeenCalled();
  });
});
