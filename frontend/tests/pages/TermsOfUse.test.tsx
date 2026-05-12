import { render, screen } from '@testing-library/react';
import TermsOfUse from '../../src/pages/TermsOfUse';
import useTheme from 'hooks/useTheme';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('assets/images/terms-and-conditions.png', () => 'mock-banner.png');

jest.mock('components/LegalPageTemplate/LegalPageTemplate', () => ({
  __esModule: true,
  default: ({
    htmlContent,
    title,
    latestUpdate,
    bannerImage,
    isLoading,
  }: {
    htmlContent: string;
    title: string;
    latestUpdate?: string;
    bannerImage: string;
    isLoading?: boolean;
  }) => (
    <div data-testid="legal-page-template">
      <span data-testid="prop-title">{title}</span>
      <span data-testid="prop-html-content">{htmlContent}</span>
      <span data-testid="prop-latest-update">{latestUpdate}</span>
      <span data-testid="prop-banner-image">{bannerImage}</span>
      <span data-testid="prop-is-loading">{String(isLoading)}</span>
    </div>
  ),
}));

const mockThemeConfig = {
  termsAndConditionsHtml: '<p>Terms content</p>',
  termsAndConditionsLatestUpdate: '15 January 2024',
};

describe('TermsOfUse page', () => {
  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: mockThemeConfig,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders LegalPageTemplate', () => {
    render(<TermsOfUse />);
    expect(screen.getByTestId('legal-page-template')).toBeInTheDocument();
    expect(screen.getByTestId('prop-title')).toHaveTextContent('Terms of Use');
    expect(screen.getByTestId('prop-html-content')).toHaveTextContent('<p>Terms content</p>');
    expect(screen.getByTestId('prop-latest-update')).toHaveTextContent('15 January 2024');
    expect(screen.getByTestId('prop-banner-image')).toHaveTextContent('mock-banner.png');
    expect(screen.getByTestId('prop-is-loading')).toHaveTextContent('false');
  });

  it('passes isLoading=true when theme config is loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: true,
      themeConfig: mockThemeConfig,
    });

    render(<TermsOfUse />);
    expect(screen.getByTestId('prop-is-loading')).toHaveTextContent('true');
  });

  it('passes empty latestUpdate when not set in themeConfig', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { ...mockThemeConfig, termsAndConditionsLatestUpdate: '' },
    });

    render(<TermsOfUse />);
    expect(screen.getByTestId('prop-latest-update')).toBeEmptyDOMElement();
  });

  it('matches snapshot', () => {
    const { container } = render(<TermsOfUse />);
    expect(container).toMatchSnapshot();
  });
});
