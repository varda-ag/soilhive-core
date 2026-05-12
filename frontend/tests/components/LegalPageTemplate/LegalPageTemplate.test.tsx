import { render, screen } from '@testing-library/react';
import LegalPageTemplate from 'components/LegalPageTemplate/LegalPageTemplate';

jest.mock('react-loading-skeleton', () => ({
  __esModule: true,
  default: () => <div data-testid="skeleton-mock" />,
}));

jest.mock('../../../src/utilities/html-display', () => ({
  htmlDisplay: (html: string) => <div data-testid="html-content">{html}</div>,
}));

const defaultProps = {
  htmlContent: '<p>Terms content</p>',
  title: 'Terms of Use',
  bannerImage: '/images/banner.jpg',
};

const renderComponent = (props: Partial<typeof defaultProps & { latestUpdate?: string; isLoading?: boolean }> = {}) =>
  render(<LegalPageTemplate {...defaultProps} {...props} />);

describe('LegalPageTemplate component', () => {
  describe('loading state', () => {
    it('renders Skeleton when isLoading is true', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByTestId('skeleton-mock')).toBeInTheDocument();
    });

    it('does not render main content when isLoading is true', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByRole('main')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('does not render Skeleton when isLoading is false', () => {
      renderComponent({ isLoading: false });
      expect(screen.queryByTestId('skeleton-mock')).not.toBeInTheDocument();
    });

    it('does not render Skeleton when isLoading is not provided', () => {
      renderComponent();
      expect(screen.queryByTestId('skeleton-mock')).not.toBeInTheDocument();
    });
  });

  describe('banner', () => {
    it('renders the title in an h1', () => {
      renderComponent();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Terms of Use');
    });

    it('renders the banner image with correct src', () => {
      renderComponent();
      expect(screen.getByRole('img')).toHaveAttribute('src', '/images/banner.jpg');
    });

    it('renders latestUpdate paragraph when provided', () => {
      renderComponent({ latestUpdate: '2024-01-15' });
      expect(screen.getByText('Latest update: {{date}}')).toBeInTheDocument();
    });

    it('does not render latestUpdate paragraph when not provided', () => {
      renderComponent();
      expect(screen.queryByText(/Latest update/)).not.toBeInTheDocument();
    });

    it('does not render latestUpdate paragraph when empty string', () => {
      renderComponent({ latestUpdate: '' });
      expect(screen.queryByText(/Latest update/)).not.toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('renders html content via htmlDisplay', () => {
      renderComponent();
      const content = screen.getByTestId('html-content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent('<p>Terms content</p>');
    });

    it('passes the htmlContent prop to htmlDisplay', () => {
      renderComponent({ htmlContent: '<h2>Custom content</h2>' });
      expect(screen.getByTestId('html-content')).toHaveTextContent('<h2>Custom content</h2>');
    });
  });

  it('matches snapshot', () => {
    const { container } = renderComponent({ latestUpdate: '2024-01-15' });
    expect(container).toMatchSnapshot();
  });
});
