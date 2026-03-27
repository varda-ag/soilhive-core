import { render } from '@testing-library/react';
import { DatasetsGeneralInfoStep } from '../../../src/pages/AdminPortal/DatasetsGeneralInfoStep/DatasetsGeneralInfoStep';

describe('DatasetsGeneralInfoStep', () => {
  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsGeneralInfoStep />);
    expect(container).toMatchSnapshot();
  });
});
