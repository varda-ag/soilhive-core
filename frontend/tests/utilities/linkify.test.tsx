import { render, screen } from '@testing-library/react';
import { linkify } from '../../src/utilities/linkify';

function Wrapper({ text }: { text: string }) {
  return <span>{linkify(text)}</span>;
}

describe('linkify', () => {
  it('returns plain text unchanged when no URL is present', () => {
    render(<Wrapper text="Re-upload the file and try again." />);
    expect(screen.getByText('Re-upload the file and try again.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a bare URL as a clickable link', () => {
    render(<Wrapper text="See https://example.com for details." />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('preserves surrounding text when a URL is present', () => {
    render(<Wrapper text="Check the docs: https://example.com/docs" />);
    expect(screen.getByText(/Check the docs:/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveTextContent('https://example.com/docs');
  });

  it('renders multiple URLs as separate links', () => {
    render(<Wrapper text="See https://example.com and https://other.com" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://example.com');
    expect(links[1]).toHaveAttribute('href', 'https://other.com');
  });
});
