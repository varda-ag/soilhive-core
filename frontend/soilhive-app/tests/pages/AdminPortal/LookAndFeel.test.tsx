import { render } from '@testing-library/react';
import { LookAndFeel } from '../../../src/pages/AdminPortal/LookAndFeel/LookAndFeel';

describe('TermsAndConditions page', () => {
  it('matches snapshot', () => {
    const { container } = render(<LookAndFeel />);
    expect(container).toMatchSnapshot();
  });
});
