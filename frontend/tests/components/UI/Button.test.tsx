import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from 'components/UI/Button/Button';

jest.mock('react-router', () => ({
  Link: ({ to, children, className }: any) => (
    <a data-testid="mock-router-link" href={to} className={className}>
      {children}
    </a>
  ),
}));

describe('Button component', () => {
  it('renders a normal button by default', () => {
    const { container } = render(<Button>Click me</Button>);

    const btn = screen.getByTestId('sh-ui-button');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveTextContent('Click me');
    expect(container).toMatchSnapshot();
  });

  it('renders as type submit when form prop is provided', () => {
    render(<Button form="testForm">Click me</Button>);

    const btn = screen.getByTestId('sh-ui-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('form', 'testForm');
  });

  it('calls onClick when button is clicked', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Press</Button>);

    const btn = screen.getByTestId('sh-ui-button');
    fireEvent.click(btn);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClick when disabled', () => {
    const handleClick = jest.fn();
    render(
      <Button isDisabled onClick={handleClick}>
        Disabled
      </Button>,
    );

    const btn = screen.getByTestId('sh-ui-button');
    fireEvent.click(btn);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders as an internal Link when "to" is provided', () => {
    const { container } = render(<Button to="/dashboard">Go</Button>);

    const link = screen.getByTestId('mock-router-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(link.tagName).toBe('A');
    expect(container).toMatchSnapshot();
  });

  it('renders as external link when "href" is provided', () => {
    const { container } = render(<Button href="https://example.com">External</Button>);

    const link = screen.getByTestId('sh-ui-button-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.tagName).toBe('A');
    expect(container).toMatchSnapshot();
  });

  it('applies danger class when isDanger=true', () => {
    render(<Button isDanger>Danger</Button>);

    const btn = screen.getByTestId('sh-ui-button');
    expect(btn.className).toMatch(/Danger/);
  });

  it('applies icon-only class when isIconOnly=true', () => {
    render(<Button isIconOnly>Icon</Button>);

    const btn = screen.getByTestId('sh-ui-button');
    expect(btn.className).toMatch(/IconOnly/);
  });

  it('supports custom className', () => {
    render(<Button className="custom-class">Hello</Button>);

    const btn = screen.getByTestId('sh-ui-button');
    expect(btn).toHaveClass('custom-class');
  });
});
