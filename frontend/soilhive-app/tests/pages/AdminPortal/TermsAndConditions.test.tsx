import { render } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { TermsAndConditions } from '../../../src/pages/AdminPortal/TermsAndConditions/TermsAndConditions';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('TermsAndConditions page', () => {
  it('matches snapshot', () => {
    (useTheme as jest.Mock).mockReturnValue({ isLoadingTermsAndConditions: false, termsAndConditionsHtml: 'mock' });
    const { container } = render(<TermsAndConditions />);
    expect(container).toMatchSnapshot();
  });
});
