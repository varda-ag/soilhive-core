import { render, screen } from '@testing-library/react';
import { ColorsPreview } from 'components/AdminPortal/LookAndFeel/ColorsPreview/ColorsPreview';
import useLookAndFeel from 'hooks/useLookAndFeel';

jest.mock('hooks/useLookAndFeel', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('components/DatasetsSidebar/DatasetsSidebarHeader/DatasetsSidebarHeader', () => ({
  DatasetsSidebarHeader: ({ preview }: any) => <div data-testid="mock-sidebar-header" data-preview={String(!!preview)} />,
}));

jest.mock('components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummary', () => ({
  DatasetsSidebarSummary: ({ datasetsSummary, preview }: any) => (
    <div data-testid="mock-sidebar-summary" data-preview={String(!!preview)} data-count={datasetsSummary.count} />
  ),
}));

jest.mock('components/UI/SelectionPills/Pill', () => ({
  Pill: ({ onRemove }: any) => <button data-testid="mock-pill" onClick={onRemove} />,
}));

describe('ColorsPreview', () => {
  beforeEach(() => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      colors: {
        'primary-default': '#ff0000',
        'primary-hover': '#cc0000',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders all three section headings', () => {
    render(<ColorsPreview />);

    expect(screen.getByText('Buttons states')).toBeInTheDocument();
    expect(screen.getByText('Filter pills')).toBeInTheDocument();
    expect(screen.getByText('Backgrounds')).toBeInTheDocument();
  });

  it('applies color CSS variables as inline styles on the wrapper', () => {
    const { container } = render(<ColorsPreview />);
    const wrapper = container.firstChild as HTMLElement;

    expect(wrapper.style.getPropertyValue('--color-primary-default')).toBe('#ff0000');
    expect(wrapper.style.getPropertyValue('--color-primary-hover')).toBe('#cc0000');
  });

  it('renders three buttons', () => {
    render(<ColorsPreview />);

    expect(screen.getAllByTestId('sh-ui-button')).toHaveLength(3);
  });

  it('renders the Pill component', () => {
    render(<ColorsPreview />);

    expect(screen.getByTestId('mock-pill')).toBeInTheDocument();
  });

  it('onRemove on Pill is a no-op and does not throw', () => {
    render(<ColorsPreview />);

    expect(() => screen.getByTestId('mock-pill').click()).not.toThrow();
  });

  it('renders DatasetsSidebarHeader with preview prop', () => {
    render(<ColorsPreview />);

    expect(screen.getByTestId('mock-sidebar-header')).toHaveAttribute('data-preview', 'true');
  });

  it('renders DatasetsSidebarSummary with preview prop and the static datasetsSummary', () => {
    render(<ColorsPreview />);

    const summary = screen.getByTestId('mock-sidebar-summary');
    expect(summary).toHaveAttribute('data-preview', 'true');
    expect(summary).toHaveAttribute('data-count', '5');
  });

  it('updates CSS variables when colors change', () => {
    const { rerender } = render(<ColorsPreview />);

    (useLookAndFeel as jest.Mock).mockReturnValue({
      colors: { 'primary-default': '#00ff00' },
    });

    rerender(<ColorsPreview />);

    const wrapper = screen.getByText('Buttons states').closest('div[style]') as HTMLElement;
    expect(wrapper.style.getPropertyValue('--color-primary-default')).toBe('#00ff00');
  });
});
