import { render } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import Legal from '../../src/pages/Legal';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('Legal page', () => {
  it('Matches snapshot', () => {
    (useTheme as jest.Mock).mockReturnValue({ isLoadingTermsAndConditions: false, termsAndConditionsHtml: '' });
    const { container } = render(<Legal />);
    expect(container).toMatchSnapshot();
  });

  it('Properly converts HTML tags, stripping forbidden tags', () => {
    const forbiddenTags = ['html', 'body', 'title', 'script', 'xml', 'xss', 'form', 'input', 'button', 'select', 'textarea'];
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingTermsAndConditions: false,
      termsAndConditionsHtml: '<h1>OK</h1>' + forbiddenTags.map(t => `<${t}></${t}>`).join(''),
    });
    const { container } = render(<Legal />);
    for (const tag of forbiddenTags) {
      expect(container.querySelectorAll(tag)).toHaveLength(0);
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});
