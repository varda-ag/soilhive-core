import { render, screen, fireEvent } from '@testing-library/react';
import { TextInput } from 'components/UI/TextInput/TextInput';

jest.mock('components/UI', () => ({
  FormFieldWrapper: ({ children, ...rest }: any) => (
    <div data-testid="mock-wrapper" {...rest}>
      {children}
    </div>
  ),
}));

describe('TextInput component', () => {
  it('renders input field', () => {
    render(<TextInput />);
    expect(screen.getByTestId('sh-ui-textinputfield')).toBeInTheDocument();
  });

  it('renders placeholder and initial value', () => {
    render(<TextInput placeholder="Type here" value="Hello" />);

    const input = screen.getByTestId('sh-ui-textinputfield');
    expect(input).toHaveAttribute('placeholder', 'Type here');
    expect(input).toHaveValue('Hello');
  });

  it('calls onChange when user types', () => {
    const handleChange = jest.fn();

    render(<TextInput name="email" onChange={handleChange} />);

    const input = screen.getByTestId('sh-ui-textinputfield');

    fireEvent.change(input, { target: { value: 'aaa' } });

    expect(handleChange).toHaveBeenCalledWith('aaa', 'email');
  });

  it('calls onFocus when input is focused', () => {
    const handleFocus = jest.fn();

    render(<TextInput onFocus={handleFocus} />);

    const input = screen.getByTestId('sh-ui-textinputfield');
    fireEvent.focus(input);

    expect(handleFocus).toHaveBeenCalled();
  });

  it('calls onBlur when input loses focus', () => {
    const handleBlur = jest.fn();

    render(<TextInput onBlur={handleBlur} />);

    const input = screen.getByTestId('sh-ui-textinputfield');
    fireEvent.blur(input);

    expect(handleBlur).toHaveBeenCalled();
  });

  it('updates internal state when value prop changes', () => {
    const { rerender } = render(<TextInput value="A" />);

    const input = screen.getByTestId('sh-ui-textinputfield');
    expect(input).toHaveValue('A');

    rerender(<TextInput value="B" />);
    expect(input).toHaveValue('B');
  });

  it('shows clear button when isClearable=true', () => {
    render(<TextInput isClearable value="abc" />);

    expect(screen.getByTestId('sh-ui-cleartexticon')).toBeInTheDocument();
  });

  it('clears text and triggers handlers when clear icon is clicked', async () => {
    const handleClear = jest.fn();
    const handleChange = jest.fn();

    render(<TextInput isClearable value="abc" name="field" onClear={handleClear} onChange={handleChange} />);

    const clearIcon = screen.getByTestId('sh-ui-cleartexticon');
    fireEvent.click(clearIcon);

    expect(handleChange).toHaveBeenCalledWith('', 'field');
    expect(handleClear).toHaveBeenCalledWith('field');
  });

  it('disables the input when isDisabled=true', () => {
    render(<TextInput isDisabled />);

    const input = screen.getByTestId('sh-ui-textinputfield');
    expect(input).toBeDisabled();
  });

  it('makes input read-only when isReadOnly=true', () => {
    render(<TextInput isReadOnly />);

    const input = screen.getByTestId('sh-ui-textinputfield');
    expect(input).toBeDisabled(); // readOnly + disabled logic inside component
  });

  it('applies error class when isError=true', () => {
    render(<TextInput isError />);

    const wrapper = screen.getByTestId('sh-ui-textinput');
    expect(wrapper.className).toMatch('Invalid');
  });

  it('applies custom classnames', () => {
    render(<TextInput className="outer" inputClassName="inner" />);

    const wrapper = screen.getByTestId('sh-ui-textinput');
    expect(wrapper).toHaveClass('inner');
    expect(screen.getByTestId('mock-wrapper')).toHaveClass('outer');
  });

  it('matches snapshot', () => {
    const { container } = render(<TextInput label="Email" value="hello" placeholder="Type..." isClearable isError errorMessage="Wrong!" />);

    expect(container).toMatchSnapshot();
  });
});
