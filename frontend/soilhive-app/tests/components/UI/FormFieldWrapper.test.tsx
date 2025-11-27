import { render, screen } from '@testing-library/react';
import { FormFieldWrapper } from 'components/UI/FormFieldWrapper/FormFieldWrapper';

// rs.mock('components/UI', () => ({
//   FormMessage: ({ type, message }: any) => (
//     <div data-testid={`form-message-${type}`}>{message}</div>
//   ),
// }));

// rs.mock('react-tooltip', () => ({
//   Tooltip: ({ id }: { id: string }) => (
//     <div data-testid={`tooltip-${id}`} />
//   ),
// }));

describe('FormFieldWrapper component', () => {
  it('renders child input field', () => {
    render(
      <FormFieldWrapper>
        <input data-testid="test-input" />
      </FormFieldWrapper>
    );
    expect(screen.getByTestId('test-input')).toBeInTheDocument();
  });

  it('renders label text', () => {
    render(
      <FormFieldWrapper label="Email">
        <input data-testid="test-input" />
      </FormFieldWrapper>
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders required mark (*) when isRequired=true', () => {
    render(
      <FormFieldWrapper label="Email" isRequired={true}>
        <input data-testid="test-input" />
      </FormFieldWrapper>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders  tooltip when labelTooltip is provided', () => {
    const { container } = render(
      <FormFieldWrapper label="Email" labelTooltip="Tooltip text">
        <input data-testid="test-input" />
      </FormFieldWrapper>
    );

    expect(container.querySelector('.LabelTooltip')).toBeInTheDocument();
    // expect(screen.getByTestId('tooltip-label-tooltip')).toBeInTheDocument();
  });

  it('renders in error satate with error message when errorMessage and isError=true', () => {
    const { container } = render(
      <FormFieldWrapper
        isError={true}
        errorMessage="Error occurred"
      >
        <input data-testid="test-input" />
      </FormFieldWrapper> 
    );

    expect(container.firstChild).toHaveClass('Invalid');
    // expect(screen.getByTestId('form-message-error')).toHaveTextContent(
    //   'Error occurred'
    // );
    expect(screen.getByTestId('sh-form-message')).toHaveTextContent(
      'Error occurred'
    );
  });

  it('does NOT render error message if isError=false', () => {
    render(
      <FormFieldWrapper
        errorMessage="Should NOT render"
        isError={false}
      >
        <input data-testid="test-input" />
      </FormFieldWrapper> 
    );
    // expect(screen.queryByTestId('form-message-error')).toBeNull();
    expect(screen.queryByTestId('sh-form-message')).toBeNull();
  });

  it('renders helper message always when provided', () => {
    render(
      <FormFieldWrapper helperMessage="Helpful info">
        <input data-testid="test-input" />
      </FormFieldWrapper> 
    );
    // expect(screen.getByTestId('form-message-info')).toHaveTextContent(
    //   'Helpful info'
    // );
    expect(screen.getByTestId('sh-form-message')).toHaveTextContent(
      'Helpful info'
    );
  });

  it('accepts custom className', () => {
    const { container } = render(
      <FormFieldWrapper className="custom-class">
        <input data-testid="test-input" />
      </FormFieldWrapper> 
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('matches snapshot', () => {
    const { container } = render(
      <FormFieldWrapper
        label="Email"
        labelTooltip="Tooltip here"
        isRequired={true}
        isError={true}
        errorMessage="Invalid email"
        helperMessage="Helper text"
      >
        <input />
      </FormFieldWrapper>
    );

    expect(container).toMatchSnapshot();
  });
});
