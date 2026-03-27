import { render } from '@testing-library/react';
import { DatasetsPreviewStep } from '../../../src/pages/AdminPortal/DatasetsPreviewStep/DatasetsPreviewStep';

describe('DatasetsPreviewStep', () => {
  it('renders matches snapshot', () => {
    const { container } = render(<DatasetsPreviewStep />);
    expect(container).toMatchSnapshot();
  });
});
