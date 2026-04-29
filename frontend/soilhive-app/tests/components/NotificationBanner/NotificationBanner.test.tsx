jest.mock('components/UI', () => ({
  __esModule: true,
  Button: ({ onClick, children }: any) => <button onClick={onClick}>{children}</button>,
}));

jest.mock('../../../src/utilities/html-display', () => ({
  htmlDisplay: jest.fn((html: string) => <div data-testid="html-display">{html}</div>),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { htmlDisplay } from '../../../src/utilities/html-display';
import { NotificationBanner } from '../../../src/components/NotificationBanner/NotificationBanner';

describe('NotificationBanner component', () => {
  it('matches snapshot', () => {
    const onClose = jest.fn();
    const { container } = render(<NotificationBanner htmlMessage="<p>Hello</p>" onClose={onClose} />);
    expect(container).toMatchSnapshot();
  });

  it('renders message via htmlDisplay', () => {
    render(<NotificationBanner htmlMessage="<p>Hello</p>" />);
    expect(screen.getByTestId('html-display')).toBeInTheDocument();
    expect(htmlDisplay).toHaveBeenCalledWith('<p>Hello</p>');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<NotificationBanner htmlMessage="<p>Hello</p>" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when onClose is not provided', () => {
    render(<NotificationBanner htmlMessage="<p>Hello</p>" />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});
