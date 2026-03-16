import { render } from '@testing-library/react';
import { DatasetsPublication } from '../../../src/pages/AdminPortal/DatasetsPublication/DatasetsPublication';

describe('DatasetsPublication page', () => {
  it('matches snapshot', () => {
    const { container } = render(<DatasetsPublication />);
    expect(container).toMatchSnapshot();
  });
});
