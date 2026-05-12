import { render, screen, fireEvent } from '@testing-library/react';
import { ExpandableText } from 'components/UI/ExpandableText/ExpandableText';

describe('ExpandableText', () => {
  const longText =
    'This is a very long text that should definitely trigger truncation because it exceeds the two-line limit we set in our CSS styles.';
  const shortText = 'Short text.';

  it('does not show "Read more" button if text is short', () => {
    // Mocking heights: scrollHeight (10) <= clientHeight (20)
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 10 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 20 });

    render(<ExpandableText text={shortText} />);

    expect(screen.queryByText('Read more')).not.toBeInTheDocument();
  });

  it('shows "Read more" if text is truncated and expands on click', () => {
    // Mocking heights: scrollHeight (100) > clientHeight (40)
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 40 });

    render(<ExpandableText text={longText} />);

    // Check button exists
    const button = screen.getByText('Read more');
    expect(button).toBeInTheDocument();

    // Trigger click
    fireEvent.click(button);

    // Check if label changes to "Read less"
    expect(screen.getByText('Read less')).toBeInTheDocument();
  });

  it('uses custom labels passed via props instead of default translations', () => {
    // Mocking heights to ensure button appears
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 40 });

    render(<ExpandableText text={longText} readMoreLabel="Show info" readLessLabel="Hide info" />);

    expect(screen.getByText('Show info')).toBeInTheDocument();
  });
});
