import { render } from '@testing-library/react';
import { LogoTab } from '../../../../src/pages/AdminPortal/LookAndFeel/tabs/LogoTab/LogoTab';

jest.mock('components/AdminPortal/LookAndFeel/UploadLogo/UploadLogo', () => ({
  UploadLogo: () => <div>UploadLogo component</div>,
}));

describe('LogoTab page', () => {
  it('matches snapshot', () => {
    const { container } = render(<LogoTab />);
    expect(container).toMatchSnapshot();
  });
});
