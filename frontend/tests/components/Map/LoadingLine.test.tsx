import { render, screen } from '@testing-library/react';
import LoadingLine from 'components/Map/LoadingLine/LoadingLine';

describe('LoadingLine', () => {
  it('renders when isLoading is true', () => {
    render(<LoadingLine isLoading />);
    expect(screen.getByTestId('sh-loading-line')).toBeInTheDocument();
    expect(screen.getByTestId('sh-loading-line-inner')).toBeInTheDocument();
  });

  it('renders nothing when isLoading is false', () => {
    const { container } = render(<LoadingLine isLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when isLoading is omitted', () => {
    const { container } = render(<LoadingLine />);
    expect(container).toBeEmptyDOMElement();
  });
});
