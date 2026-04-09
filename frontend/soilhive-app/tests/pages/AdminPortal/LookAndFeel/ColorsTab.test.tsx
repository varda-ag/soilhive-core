import { render } from '@testing-library/react';
import { ColorsTab } from '../../../../src/pages/AdminPortal/LookAndFeel/tabs/ColorsTab/ColorsTab';

describe('ColorsTab page', () => {
  it('matches snapshot', () => {
    const { container } = render(<ColorsTab />);
    expect(container).toMatchSnapshot();
  });
});
