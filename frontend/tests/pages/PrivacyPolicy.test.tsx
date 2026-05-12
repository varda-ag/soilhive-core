import { render, screen } from '@testing-library/react';
import PrivacyPolicy from '../../src/pages/PrivacyPolicy';
import useTheme from 'hooks/useTheme';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('assets/images/privacy-policy.png', () => 'mock-banner.png');

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
  privacyPolicyHtml: '<p>PrivacyPolicy content</p>',
  privacyPolicyLatestUpdate: '15 January 2024',
};

describe('PrivacyPolicy page', () => {
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
    render(<PrivacyPolicy />);
    expect(screen.getByTestId('legal-page-template')).toBeInTheDocument();
    expect(screen.getByTestId('prop-title')).toHaveTextContent('Privacy Policy');
    expect(screen.getByTestId('prop-html-content')).toHaveTextContent('<p>PrivacyPolicy content</p>');
    expect(screen.getByTestId('prop-latest-update')).toHaveTextContent('15 January 2024');
    expect(screen.getByTestId('prop-banner-image')).toHaveTextContent('mock-banner.png');
    expect(screen.getByTestId('prop-is-loading')).toHaveTextContent('false');
  });

  it('passes isLoading=true when theme config is loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: true,
      themeConfig: mockThemeConfig,
    });

    render(<PrivacyPolicy />);
    expect(screen.getByTestId('prop-is-loading')).toHaveTextContent('true');
  });

  it('passes empty latestUpdate when not set in themeConfig', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { ...mockThemeConfig, privacyPolicyLatestUpdate: '' },
    });

    render(<PrivacyPolicy />);
    expect(screen.getByTestId('prop-latest-update')).toBeEmptyDOMElement();
  });

  it('matches snapshot', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container).toMatchSnapshot();
  });
});
