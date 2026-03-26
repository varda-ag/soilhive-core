import { render } from '@testing-library/react';
import { DatasetsQualityCheckStep } from '../../../src/pages/AdminPortal/DatasetsQualityCheckStep/DatasetsQualityCheckStep';

describe('DatasetsQualityCheckStep', () => {
  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsQualityCheckStep />);
    expect(container).toMatchSnapshot();
  });
});
