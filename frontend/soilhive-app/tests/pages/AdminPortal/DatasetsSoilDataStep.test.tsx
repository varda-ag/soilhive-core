import { render } from '@testing-library/react';
import { DatasetsSoilDataStep } from '../../../src/pages/AdminPortal/DatasetsSoilDataStep/DatasetsSoilDataStep';

describe('DatasetsSoilDataStep', () => {
  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsSoilDataStep />);
    expect(container).toMatchSnapshot();
  });
});
