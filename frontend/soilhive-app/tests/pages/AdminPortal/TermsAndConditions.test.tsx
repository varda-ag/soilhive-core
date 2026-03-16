import { render } from '@testing-library/react';
import { TermsAndConditions } from '../../../src/pages/AdminPortal/TermsAndConditions/TermsAndConditions';

describe('TermsAndConditions page', () => {
  it('matches snapshot', () => {
    const { container } = render(<TermsAndConditions />);
    expect(container).toMatchSnapshot();
  });
});
