import { render, screen } from '@testing-library/react';
import { FormMessage } from 'components/UI/FormMessage/FormMessage';

describe('FormMessage component', () => {
  it('renders message text', () => {
    const { container } = render(<FormMessage message="Hello world" />);

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders info message by default', () => {
    const { container } = render(<FormMessage message="Info message" />);

    expect(screen.getByTestId('sh-form-message')).toHaveClass('InfoMessage');
    expect(screen.getByTestId('sh-form-message-icon-info')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders error type', () => {
    const { container } = render(<FormMessage message="Error!" type="error" />);

    expect(screen.getByTestId('sh-form-message')).toHaveClass('ErrorMessage');
    expect(screen.getByTestId('sh-form-message-icon-error')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders warning type', () => {
    const { container } = render(<FormMessage message="Warn" type="warning" />);

    expect(screen.getByTestId('sh-form-message')).toHaveClass('WarningMessage');
    expect(screen.getByTestId('sh-form-message-icon-warning')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('applies withBackground class', () => {
    const { container } = render(<FormMessage message="With background" withBackground />);

    expect(screen.getByTestId('sh-form-message')).toHaveClass('Global');
    expect(container).toMatchSnapshot();
  });
});
