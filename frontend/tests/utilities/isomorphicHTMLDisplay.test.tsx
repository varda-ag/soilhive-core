import React from 'react';
import { render, screen } from '@testing-library/react';
import { htmlDisplay } from '../../src/utilities/isomorphicHTMLDisplay';

describe('htmlDisplay', () => {
  it.each([[null], [undefined], ['']])('returns empty string for %p', input => {
    expect(htmlDisplay(input as string | null | undefined)).toBe('');
  });

  it('renders allowed tags', () => {
    const { container } = render(<>{htmlDisplay('<p>hello <strong>world</strong></p>')}</>);
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p).toHaveTextContent('hello world');
    expect(container.querySelector('strong')).toHaveTextContent('world');
  });

  it('preserves anchor tags with href', () => {
    const { container } = render(<>{htmlDisplay('<a href="https://example.com">link</a>')}</>);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a).toHaveAttribute('href', 'https://example.com');
    expect(a).toHaveTextContent('link');
  });

  it.each(['form', 'input', 'button', 'select', 'textarea'])('strips forbidden tag <%s> while keeping surrounding content', tag => {
    const inner = tag === 'input' ? '' : 'inside';
    const html = `<p>before</p><${tag}>${inner}</${tag}><p>after</p>`;
    const { container } = render(<>{htmlDisplay(html)}</>);
    expect(container.querySelector(tag)).toBeNull();
    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
  });

  it('strips disallowed-by-default tags like <script>', () => {
    const { container } = render(<>{htmlDisplay('<script>alert(1)</script>hello')}</>);
    expect(container.querySelector('script')).toBeNull();
    expect(container).toHaveTextContent('hello');
    expect(container).not.toHaveTextContent('alert(1)');
  });

  it('returns a valid React element for non-empty input', () => {
    const result = htmlDisplay('<p>x</p>');
    expect(React.isValidElement(result)).toBe(true);
  });

  it('does not short-circuit on whitespace-only input', () => {
    const result = htmlDisplay('   ');
    expect(result).not.toBe('');
    expect(React.isValidElement(result)).toBe(true);
  });
});
