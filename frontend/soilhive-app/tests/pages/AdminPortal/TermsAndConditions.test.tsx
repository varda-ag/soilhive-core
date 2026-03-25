import { render } from '@testing-library/react';
import useConfig from 'hooks/useConfig';
import { TermsAndConditions } from '../../../src/pages/AdminPortal/TermsAndConditions/TermsAndConditions';

jest.mock('hooks/useConfig', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('TermsAndConditions page', () => {
  it('matches snapshot', () => {
    (useConfig as jest.Mock).mockReturnValue({ isLoading: false, config: { html: 'mock' }, saveConfig: () => {} });
    const { container } = render(<TermsAndConditions />);
    expect(container).toMatchSnapshot();
  });
});
