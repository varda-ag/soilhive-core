import { render } from '@testing-library/react';
import { LogoTab } from '../../../../src/pages/AdminPortal/LookAndFeel/tabs/LogoTab/LogoTab';

describe('LogoTab page', () => {
  it('matches snapshot', () => {
    const { container } = render(<LogoTab />);
    expect(container).toMatchSnapshot();
  });
});
