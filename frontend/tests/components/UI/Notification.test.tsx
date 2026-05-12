import { render, screen, fireEvent } from '@testing-library/react';
import { Notification } from 'components/UI/Notification/Notification';

describe('Notification', () => {
  it('renders title and no message when message is not provided', () => {
    const { container } = render(<Notification title="Title" onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-notification')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('renders message when provided', () => {
    const { container } = render(<Notification title="Title" message="My message" onClose={jest.fn()} />);

    expect(screen.getByText('My message')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it("uses 'error' type by default", () => {
    render(<Notification title="Default type" onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-notification')).toHaveClass('Error');
  });

  it("applies warning class when type='warning'", () => {
    render(<Notification title="Warning" type="warning" onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-notification')).toHaveClass('Warning');
  });

  it("applies success class when type='success'", () => {
    render(<Notification title="Success" type="success" onClose={jest.fn()} />);

    expect(screen.getByTestId('sh-ui-notification')).toHaveClass('Success');
  });

  it('calls onClose when close icon is clicked', () => {
    const onClose = jest.fn();
    render(<Notification title="Title" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sh-ui-notification-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
