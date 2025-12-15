import { render, screen } from '@testing-library/react';
import { PageSidebar } from 'components/UI/PageSidebar/PageSidebar';

describe('PageSidebar component', () => {
  it('renders children correctly', () => {
    render(
      <PageSidebar isOpened={false} position="right">
        <div data-testid="content">Sidebar Content</div>
      </PageSidebar>,
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('applies "Opened" class when isOpened=true', () => {
    const { container } = render(
      <PageSidebar isOpened={true} position="right">
        Content
      </PageSidebar>,
    );

    expect(container.firstChild).toHaveClass('Opened');
  });

  it('applies "Right" position class when position="right"', () => {
    const { container } = render(
      <PageSidebar isOpened={false} position="right">
        Content
      </PageSidebar>,
    );

    expect(container.firstChild).toHaveClass('Right');
  });

  it('applies "Left" position class when position="left"', () => {
    const { container } = render(
      <PageSidebar isOpened={false} position="left">
        Content
      </PageSidebar>,
    );

    expect(container.firstChild).toHaveClass('Left');
  });

  it('accepts custom className', () => {
    const { container } = render(
      <PageSidebar isOpened={false} position="left" className="custom-class">
        Content
      </PageSidebar>,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('matches snapshot', () => {
    const { container } = render(
      <PageSidebar isOpened={true} position="left">
        Snapshot Content
      </PageSidebar>,
    );

    expect(container).toMatchSnapshot();
  });
});
