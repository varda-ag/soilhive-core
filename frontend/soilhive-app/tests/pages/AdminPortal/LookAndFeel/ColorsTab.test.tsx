import { render } from '@testing-library/react';
import { ColorsTab } from '../../../../src/pages/AdminPortal/LookAndFeel/tabs/ColorsTab/ColorsTab';

jest.mock('components/AdminPortal/LookAndFeel/ColorsSettings/ColorsSettings', () => ({
  ColorsSettings: () => <div>ColorsSettings component</div>,
}));

jest.mock('components/AdminPortal/LookAndFeel/ColorsPreview/ColorsPreview', () => ({
  ColorsPreview: () => <div>ColorsPreview component</div>,
}));

describe('ColorsTab page', () => {
  it('matches snapshot', () => {
    const { container } = render(<ColorsTab />);
    expect(container).toMatchSnapshot();
  });
});
